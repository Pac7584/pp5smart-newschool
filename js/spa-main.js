/* =========================
   GLOBAL CONFIG
========================= */
const DEV_MODE = false;

/* =========================
   APP STATE (รวมที่เดียว)
========================= */
window.AppNavigation = window.AppNavigation || {
  currentPage: null,
  navigationHistory: [],
  isLoading: false
};
window.NavGuard = { isLoadingSince: 0 };

/* =========================
   WATCHDOG
========================= */
(function setupGlobalLoadingWatchdog() {
  let loadingStartTime = 0;
  const STUCK_TIMEOUT_MS = 15000;
  setInterval(() => {
    try {
      const isLoading = window.AppNavigation.isLoading;
      if (isLoading && loadingStartTime === 0) loadingStartTime = Date.now();
      else if (!isLoading && loadingStartTime !== 0) loadingStartTime = 0;
      else if (isLoading && loadingStartTime !== 0 && Date.now() - loadingStartTime > STUCK_TIMEOUT_MS) {
        // console.warn('⚠️ Watchdog: Loading stuck, resetting...');
        window.AppNavigation.isLoading = false;
        window.NavGuard.isLoadingSince = 0;
        document.getElementById('sidebarBackdrop')?.classList.remove('show');
        const spinner = document.querySelector('.loading-spinner');
        if (spinner) spinner.remove();
        showLoadError(window.AppNavigation.currentPage || 'unknown');
        loadingStartTime = 0;
      }
    } catch (e) { loadingStartTime = 0; }
  }, 2000);
})();

/* =========================
   LOGOUT
========================= */
let isLoggingOut = false;

function writeLogoutOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'logoutOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(5px)';
  overlay.innerHTML = '<div style="background:white;padding:30px;border-radius:15px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.3);"><div class="spinner-border text-primary" role="status" style="width:3rem;height:3rem;margin-bottom:20px;"><span class="visually-hidden">Loading...</span></div><h4 style="color:#333;margin-bottom:10px;">กำลังออกจากระบบ...</h4><p style="color:#666;margin:0;">กรุณารอสักครู่</p></div>';
  document.body.appendChild(overlay);
}

function hardRedirectTo(url, fromUser = false) {
  if (!fromUser) return;
  try {
    const form = document.createElement('form');
    form.method = 'GET';
    form.action = url;
    form.target = '_top';
    form.style.display = 'none';
    document.body.appendChild(form);
    form.submit();
    return;
  } catch (_e) {}
  try { window.open(url, '_top'); return; } catch (_e) {}
  try { if (window.top === window.self) window.location.replace(url); } catch (_e) {}
}

function _buildLoginUrl(serverUrl) {
  var url = serverUrl || '';
  try {
    var r = document.referrer || '';
    if (r) {
      var rb = r.split('?')[0].replace(/\/dev$/, '/exec');
      if (rb.endsWith('/exec')) url = url || rb;
    }
  } catch(_) {}
  if (!url) url = window.location.origin + window.location.pathname;
  return url + (url.includes('?') ? '&' : '?') + 'page=login&_t=' + Date.now();
}

function _doLogoutRedirect(url) {
  try { window.location.href = url; } catch(_) {}
}

function showRedirectButton(url) {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);font-family:\'Sarabun\',sans-serif;margin:0;padding:20px;"><div style="background:white;border-radius:15px;padding:40px;box-shadow:0 15px 35px rgba(0,0,0,0.2);text-align:center;max-width:420px;width:100%;animation:fadeIn .35s ease-out;"><div style="font-size:48px;margin-bottom:20px;">✅</div><h2 style="color:#333;margin-bottom:12px;font-weight:600;">ออกจากระบบสำเร็จ</h2><p style="color:#666;margin-bottom:24px;line-height:1.6;">กรุณากดปุ่มด้านล่างเพื่อกลับไปหน้าเข้าสู่ระบบ</p><a id="redirectBtn" href="' + url + '" target="_top" rel="noopener" style="display:inline-block;width:100%;padding:14px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;">กลับไปหน้าเข้าสู่ระบบ</a></div></div><style>@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}</style>';
}

function renderLoginPageAfterLogout(loginUrl) {
  // Never extract only <form> from the legacy page: that drops its styles,
  // heading and responsive shell. A clean navigation also resets every SPA
  // layout class after Supabase has removed the browser session.
  _doLogoutRedirect(loginUrl);
}
function navigateToAuthPage_(targetPage) {
  const sidebar = document.getElementById('sidebar');
  const header = document.querySelector('.app-header');
  const backdrop = document.getElementById('sidebarBackdrop');
  const mainContent = document.getElementById('mainContent');
  const contentFrame = document.getElementById('contentFrame');
  if (sidebar) sidebar.style.display = 'none';
  if (header) header.style.display = 'none';
  if (backdrop) backdrop.style.display = 'none';
  if (mainContent) { mainContent.style.marginLeft = '0'; mainContent.style.marginTop = '0'; }
  if (contentFrame) {
    contentFrame.classList.remove('content-card');
  }

  const isLoginPage = targetPage === 'login';
  const isPublicAuthPage = isLoginPage || targetPage === 'forgot_password';
  document.body.classList.toggle('pp5-public-auth-page', isPublicAuthPage);
  document.body.classList.toggle('pp5-login-page', isLoginPage);

  showMainLoading();
  return loadPage(targetPage).then(() => {
    setActivePage(targetPage);
    updateURL(targetPage);
    if (targetPage === 'login') enhanceSupabaseLoginPage_();
    if (targetPage === 'forgot_password') enhanceSupabaseForgotPasswordPage_();
  }).catch(() => showLoadError(targetPage));
}

function enhanceSupabaseForgotPasswordPage_() {
  const frame = document.getElementById('contentFrame');
  if (!frame) return;

  const backLink = frame.querySelector('#backToLogin');
  if (backLink && !backLink.dataset.pp5SpaBound) {
    backLink.dataset.pp5SpaBound = '1';
    backLink.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      navigateToAuthPage_('login');
    });
  }

  const form = frame.querySelector('#fpForm');
  if (form && !form.dataset.pp5SpaBound) {
    form.dataset.pp5SpaBound = '1';
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const usernameInput = frame.querySelector('#fpUsername');
      const emailInput = frame.querySelector('#fpEmail');
      const btn = frame.querySelector('#fpBtn');
      const loading = frame.querySelector('#fpLoading');
      const statusBox = frame.querySelector('#fpStatus');

      const username = (usernameInput?.value || '').trim();
      const email = (emailInput?.value || '').trim();

      const setBusy = (b) => {
        if (btn) btn.disabled = !!b;
        if (loading) loading.style.display = b ? 'block' : 'none';
      };
      const setStatus = (msg, isErr) => {
        if (!statusBox) return;
        if (!msg) { statusBox.textContent = ''; statusBox.className = 'status'; return; }
        statusBox.textContent = msg;
        statusBox.className = 'status ' + (isErr ? 'err' : 'ok');
      };

      if (!username || !email) {
        setStatus('กรุณากรอกชื่อผู้ใช้และอีเมลที่ลงทะเบียน', true);
        return;
      }

      setBusy(true);
      setStatus('');

      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        setBusy(false);
        setStatus('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', true);
        return;
      }

      const w = setTimeout(() => {
        setBusy(false);
        setStatus('การเชื่อมต่อใช้เวลานาน กรุณาลองใหม่', true);
      }, 20000);

      google.script.run
        .withSuccessHandler((res) => {
          clearTimeout(w);
          setBusy(false);
          if (res && res.success) {
            setStatus(res.message || 'ส่งรหัสผ่านชั่วคราวไปที่อีเมลของคุณแล้ว');
          } else {
            setStatus((res && res.message) ? res.message : 'ไม่สามารถทำรายการได้', true);
          }
        })
        .withFailureHandler((err) => {
          clearTimeout(w);
          setBusy(false);
          setStatus((err && err.message) ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่', true);
        })
        .requestPasswordReset({ username, email });
    });
  }
}

function enhanceSupabaseChangePasswordPage_() {
  const frame = document.getElementById('contentFrame');
  if (!frame || frame.dataset.pp5RecoveryBound === '1') return;
  const applyRecoveryMode = function() {
    if (!window.__PP5_PASSWORD_RECOVERY) return;
    const oldPassword = frame.querySelector('#oldPassword');
    if (!oldPassword) return;
    oldPassword.required = false;
    oldPassword.value = '';
    const oldPasswordGroup = oldPassword.closest('.mb-3') || oldPassword.parentElement;
    if (oldPasswordGroup) oldPasswordGroup.hidden = true;
    if (oldPasswordGroup?.parentElement && !oldPasswordGroup.parentElement.querySelector('[data-pp5-recovery-note]')) {
      const note = document.createElement('p');
      note.dataset.pp5RecoveryNote = '1';
      note.className = 'alert alert-info py-2';
      note.textContent = 'ตั้งรหัสผ่านใหม่จากลิงก์กู้บัญชีได้โดยไม่ต้องกรอกรหัสผ่านเดิม';
      oldPasswordGroup.parentElement.prepend(note);
    }
  };
  frame.dataset.pp5RecoveryBound = '1';
  applyRecoveryMode();
  document.addEventListener('pp5:password-recovery', applyRecoveryMode);
}

function enhanceSupabaseLoginPage_() {
  const frame = document.getElementById('contentFrame');
  const card = frame?.querySelector('.login-container');
  const form = frame?.querySelector('#loginForm');
  const button = frame?.querySelector('#loginBtn');
  const errorBox = frame?.querySelector('#errorBox');
  if (!card || !form || !button || form.dataset.pp5StableTransition === '1') return;
  form.dataset.pp5StableTransition = '1';

  const forgotLink = frame?.querySelector('#forgotLink');
  if (forgotLink && !forgotLink.dataset.pp5SpaBound) {
    forgotLink.dataset.pp5SpaBound = '1';
    forgotLink.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      navigateToAuthPage_('forgot_password');
    });
  }

  const clearPending = function() {
    card.classList.remove('pp5-login-pending');
    card.style.removeProperty('--pp5-login-locked-height');
    card.querySelector('#pp5LoginTransition')?.remove();
  };

  form.addEventListener('submit', function() {
    const username = frame.querySelector('#username')?.value?.trim() || '';
    const password = frame.querySelector('#password')?.value || '';
    if (!username || !password || card.classList.contains('pp5-login-pending')) return;
    const height = Math.ceil(card.getBoundingClientRect().height);
    card.style.setProperty('--pp5-login-locked-height', height + 'px');
    card.classList.add('pp5-login-pending');
    const overlay = document.createElement('div');
    overlay.id = 'pp5LoginTransition';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = '<span class="pp5-login-transition-spinner" aria-hidden="true"></span><strong>กำลังเข้าสู่ระบบ...</strong><small>กำลังตรวจสอบบัญชี กรุณารอสักครู่</small>';
    card.appendChild(overlay);
  }, true);

  const observer = new MutationObserver(function() {
    if (!card.classList.contains('pp5-login-pending') || button.disabled) return;
    requestAnimationFrame(function() {
      if (errorBox && getComputedStyle(errorBox).display !== 'none') clearPending();
    });
  });
  observer.observe(button, { attributes: true, attributeFilter: ['disabled'] });
  if (errorBox) observer.observe(errorBox, { attributes: true, attributeFilter: ['style', 'class'] });
}

window.logout = function(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  if (isLoggingOut) return false;
  isLoggingOut = true;
  writeLogoutOverlay();
  try {
    localStorage.removeItem('authToken');
    localStorage.removeItem('loggedIn');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    localStorage.removeItem('displayName');
    window.PP5WorkMode?.forget?.(); // เข้าระบบครั้งหน้าถามโหมดการทำงานใหม่
  } catch(e) {}
  const loginUrl = _buildLoginUrl('');
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(function() { renderLoginPageAfterLogout(loginUrl); })
      .withFailureHandler(function() { _doLogoutRedirect(loginUrl); })
      .clearLoginSession();
  } else {
    _doLogoutRedirect(loginUrl);
  }
  return false;
};

/* =========================
   USER INFO & NAME RESOLUTION
========================= */
function getUserFullName_() {
  const displayName = (localStorage.getItem('displayName') || '').trim();
  const firstName = (localStorage.getItem('firstName') || '').trim();
  const lastName = (localStorage.getItem('lastName') || '').trim();
  const username = (localStorage.getItem('username') || '').trim();

  if (firstName && lastName && firstName !== username) {
    return `${firstName} ${lastName}`;
  }
  if (displayName && displayName !== username && displayName !== 'ผู้ใช้') {
    return displayName;
  }
  if (firstName && firstName !== username && firstName !== 'ผู้ใช้') {
    return firstName;
  }
  if (displayName && displayName !== 'ผู้ใช้') {
    return displayName;
  }
  return username || 'ผู้ใช้';
}
window.getUserFullName = getUserFullName_;

function updateHubSubLineWithFullName_() {
  const sub = document.getElementById('hubSubLine');
  if (!sub) return;
  const username = (localStorage.getItem('username') || '').trim();
  const fullName = getUserFullName_();
  if (!fullName || fullName === username) return;

  const current = sub.textContent || '';
  if (username && current.includes('สวัสดี, ' + username)) {
    sub.textContent = current.replace('สวัสดี, ' + username, 'สวัสดี, ' + fullName);
  } else if (current.startsWith('สวัสดี,') && !current.includes(fullName)) {
    sub.textContent = current.replace(/^สวัสดี,\s*[^·|\n]+/, 'สวัสดี, ' + fullName + ' ');
  }
}

async function refreshUserProfileNamesAsync_() {
  const username = (localStorage.getItem('username') || '').trim();
  if (!username) return;
  const current = getUserFullName_();
  if (current && current !== username && current !== 'ผู้ใช้') return;

  try {
    if (window.google?.script?.run?.getCurrentUser) {
      window.google.script.run
        .withSuccessHandler(function(res) {
          if (res && res.success) {
            const resolved = res.displayName || res.fullName || ((res.firstName || '') + ' ' + (res.lastName || '')).trim();
            if (resolved && resolved !== username) {
              localStorage.setItem('displayName', resolved);
              if (res.firstName) localStorage.setItem('firstName', res.firstName);
              if (res.lastName) localStorage.setItem('lastName', res.lastName);
              if (res.className) localStorage.setItem('className', res.className);
              displayUserInfo();
              updateHubSubLineWithFullName_();
            }
          }
        })
        .getCurrentUser();
    }
  } catch (_) {}
}

function displayUserInfo() {
  const username = localStorage.getItem('username') || 'ผู้ใช้';
  const fullName = getUserFullName_();
  const role = localStorage.getItem('role') || 'teacher';
  const className = localStorage.getItem('className') || '';
  const isLoggedIn = localStorage.getItem('loggedIn') === 'true' && !!username;

  const userDisplayNameEl = document.getElementById('userDisplayName');
  const userRoleBadgeEl = document.getElementById('userRoleBadge');
  const userAvatarTextEl = document.getElementById('userAvatarText');
  const userRoomBadgeEl = document.getElementById('userRoomBadge');
  const userChipEl = document.getElementById('appHeaderUserChip');

  if (userChipEl) {
    userChipEl.style.display = isLoggedIn ? 'inline-flex' : 'none';
  }

  if (userDisplayNameEl) {
    userDisplayNameEl.textContent = fullName;
    userDisplayNameEl.setAttribute('title', `${fullName} (@${username})`);
  }

  if (userRoleBadgeEl) {
    // ครู: ป้ายตามโหมดการทำงานที่ผู้ดูแลมอบหมาย (js/work-mode.js) — ครูประจำชั้น / ครูประจำวิชา
    userRoleBadgeEl.textContent = role === 'admin' ? 'ผู้ดูแลระบบ' : (role === 'parent' ? 'ผู้ปกครอง'
      : (role === 'registrar' ? 'เจ้าหน้าที่ธุรการ' : (window.PP5WorkMode?.label?.() || 'ครู')));
    userRoleBadgeEl.className = 'badge ' + (role === 'admin' ? 'bg-danger' : (role === 'parent' ? 'bg-info' : 'bg-primary'));
  }

  if (userAvatarTextEl) {
    const cleanName = fullName.replace(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|ครู)\s*/, '');
    const firstChar = cleanName ? cleanName.charAt(0) : 'U';
    userAvatarTextEl.textContent = firstChar;
  }

  if (userRoomBadgeEl) {
    if (className && className !== 'ทุกระดับชั้น' && role !== 'admin') {
      userRoomBadgeEl.textContent = className;
      userRoomBadgeEl.style.display = 'inline';
    } else {
      userRoomBadgeEl.style.display = 'none';
    }
  }

  updateHubSubLineWithFullName_();
  refreshUserProfileNamesAsync_();
}

/* =========================
   FAVORITES
========================= */
function attachFavoriteStars_() {}
function ensureDefaultFavorites_() {}

/* =========================
   LAYOUT & RESPONSIVENESS
========================= */
function updateMode() {
  const isDesktop = window.innerWidth >= 992;
  document.documentElement.classList.toggle('is-mobile', !isDesktop);
  document.documentElement.classList.toggle('is-desktop', isDesktop);
}

/* =========================
   URL & ACTIVE PAGE
========================= */
function updateURL(page) { try { history.pushState({ page }, '', '?page=' + page); } catch (_) {} }

function setActivePage(page) {
  document.querySelectorAll('.nav-item, .menu-header').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('[data-page="' + page + '"]').forEach(item => {
    const navItem = item.closest('.nav-item');
    if (navItem) navItem.classList.add('active');
    else if (item.classList && item.classList.contains('menu-header')) item.classList.add('active');
  });
  document.body.setAttribute('data-current-page', page);
  document.getElementById('contentFrame')?.setAttribute('data-current-page', page);
  window.PP5Permissions?.refreshMenu();

  try { updatePageIndicator_(page); } catch (_e) {}
  try { renderMobileQuickMenu_(); } catch (_e) {}
}

function updatePageIndicator_(page) {
  const titleEl = document.getElementById('currentPageTitle');
  const subEl = document.getElementById('currentPageSubtitle');
  if (!titleEl || !subEl) return;

  const link = document.querySelector('.nav-link[data-page="' + page + '"], .menu-header[data-page="' + page + '"]');
  const label = link?.querySelector('.nav-label')?.dataset?.rawLabel || link?.textContent?.trim() || page;
  const group = link?.closest('.menu-group');
  const groupLabel = group?.getAttribute('aria-label') || '';

  if (page === 'home_hub') {
    titleEl.textContent = 'หน้าหลัก';
    subEl.textContent = 'เมนูหลัก';
    return;
  }
  if (page === 'dashboard') {
    titleEl.textContent = 'หน้าหลัก';
    subEl.textContent = 'ภาพรวมสถิติ';
    return;
  }

  titleEl.textContent = groupLabel ? (groupLabel + ' > ' + label) : label;
  subEl.textContent = label;
}

/* =========================
   LOADING STATE
========================= */
function showMainLoading() {
  const frame = document.getElementById('contentFrame');
  if (!frame) {
    console.error('❌ contentFrame not found');
    return;
  }
  // console.log('⏳ showMainLoading');
  frame.innerHTML = '<div class="loading-spinner animate-fade-in" style="min-height:60vh;"><div class="spinner"></div><p class="mt-3" style="color:var(--gray-600);">กำลังโหลดระบบ...</p><p class="text-muted" style="font-size:.9rem;">โปรดรอสักครู่</p></div>';
}
window.showMainLoading = showMainLoading;

function showLoadError(pageName) {
  const frame = document.getElementById('contentFrame');
  if (!frame) return;
  const username = localStorage.getItem('username') || 'ผู้ใช้';
  const fullName = getUserFullName_();
  const nameDisplay = fullName && fullName !== username ? (fullName + ' (@' + username + ')') : username;
  frame.innerHTML = '<div class="alert alert-danger p-4" style="max-width:600px;margin:50px auto;"><h4>ไม่สามารถโหลดหน้าได้</h4><p>หน้า: <strong data-error-page></strong></p><p>โปรดตรวจการเชื่อมต่อและสิทธิ์เข้าใช้งาน</p><div class="d-flex gap-2 flex-wrap"><button type="button" class="btn btn-primary" data-error-action="retry">ลองใหม่</button><button type="button" class="btn btn-success" data-error-action="home_hub">หน้าหลัก</button><button type="button" class="btn btn-warning" data-error-action="reload">รีโหลด</button><button type="button" class="btn btn-danger" data-error-action="logout">ออกจากระบบ</button></div><p class="mt-3">ผู้ใช้: <strong data-error-user></strong></p></div>';
  frame.querySelector('[data-error-page]').textContent = String(pageName || '');
  frame.querySelector('[data-error-user]').textContent = nameDisplay;
  frame.querySelectorAll('[data-error-action]').forEach(function(button) {
    button.addEventListener('click', function() { handleLoadError(button.dataset.errorAction, pageName); });
  });
  window.AppNavigation.isLoading = false;
  window.NavGuard.isLoadingSince = 0;
}
window.showLoadError = showLoadError;

/* =========================
   THAI DATE PICKER
========================= */
window.ThaiDatePicker = (function() {
  const MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  let activeInput = null;
  let activeButton = null;
  let viewYear = 0;
  let viewMonth = 0;
  let observerStarted = false;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toLocalDateString(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parts = value.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  function formatThai(value) {
    const d = parseDate(value);
    if (!d) return 'เลือกวันที่';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  }

  function getPopover() {
    let pop = document.getElementById('thaiGlobalDatePopover');
    if (pop) return pop;
    pop = document.createElement('div');
    pop.id = 'thaiGlobalDatePopover';
    pop.className = 'thai-date-popover hidden';
    pop.innerHTML =
      '<div class="thai-date-popover-head">' +
        '<button type="button" class="thai-date-popover-nav" data-date-nav="-1" aria-label="เดือนก่อนหน้า">‹</button>' +
        '<div class="thai-date-popover-title" id="thaiGlobalDateTitle">-</div>' +
        '<button type="button" class="thai-date-popover-nav" data-date-nav="1" aria-label="เดือนถัดไป">›</button>' +
      '</div>' +
      '<div class="thai-date-popover-weekdays" aria-hidden="true">' +
        '<span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span><span>อา</span>' +
      '</div>' +
      '<div class="thai-date-popover-grid" id="thaiGlobalDateGrid"></div>' +
      '<div class="thai-date-popover-foot"><button type="button" class="thai-date-popover-today" data-date-today="1">วันนี้</button></div>';
    document.body.appendChild(pop);
    pop.addEventListener('click', function(e) {
      const nav = e.target.closest('[data-date-nav]');
      if (nav) {
        changeMonth(parseInt(nav.dataset.dateNav, 10));
        return;
      }
      const today = e.target.closest('[data-date-today]');
      if (today) {
        selectDate(toLocalDateString(new Date()));
        return;
      }
      const day = e.target.closest('[data-date-value]');
      if (day) selectDate(day.dataset.dateValue);
    });
    return pop;
  }

  function positionPopover() {
    if (!activeButton) return;
    const pop = getPopover();
    const rect = activeButton.getBoundingClientRect();
    const width = Math.min(310, window.innerWidth - 24);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (left < 12) left = 12;
    let top = rect.bottom + 8;
    const estimatedHeight = 360;
    if (top + estimatedHeight > window.innerHeight - 12 && rect.top > estimatedHeight) {
      top = rect.top - estimatedHeight - 8;
    }
    if (top < 12) top = 12;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.width = width + 'px';
  }

  function open(input, button) {
    activeInput = input;
    activeButton = button;
    const base = parseDate(input.value) || new Date();
    viewYear = base.getFullYear();
    viewMonth = base.getMonth();
    render();
    positionPopover();
    getPopover().classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
  }

  function close() {
    const pop = document.getElementById('thaiGlobalDatePopover');
    if (pop) pop.classList.add('hidden');
    if (activeButton) activeButton.setAttribute('aria-expanded', 'false');
    activeInput = null;
    activeButton = null;
  }

  function changeMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    } else if (viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    }
    render();
    positionPopover();
  }

  function selectDate(value) {
    if (!activeInput) return;
    const d = parseDate(value);
    if (!d) return;
    activeInput.value = toLocalDateString(d);
    updateButton(activeInput);
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  }

  function render() {
    const pop = getPopover();
    const title = pop.querySelector('#thaiGlobalDateTitle');
    const grid = pop.querySelector('#thaiGlobalDateGrid');
    const selectedValue = activeInput ? activeInput.value : '';
    const todayValue = toLocalDateString(new Date());
    const first = new Date(viewYear, viewMonth, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(viewYear, viewMonth, 1 - offset);
    title.textContent = MONTHS[viewMonth] + ' ' + (viewYear + 543);
    let html = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const value = toLocalDateString(d);
      const classes = ['thai-date-popover-day'];
      if (d.getMonth() !== viewMonth) classes.push('is-muted');
      if (value === todayValue) classes.push('is-today');
      if (value === selectedValue) classes.push('is-selected');
      html += '<button type="button" class="' + classes.join(' ') + '" data-date-value="' + value + '" aria-label="' +
        d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543) + '">' + d.getDate() + '</button>';
    }
    grid.innerHTML = html;
  }

  function updateButton(input) {
    const button = input._thaiDateButton;
    if (!button) return;
    const text = button.querySelector('.date-text');
    if (text) text.textContent = formatThai(input.value);
  }

  function enhanceInput(input) {
    if (!input || input.dataset.thaiDateEnhanced === '1' || input.dataset.noThaiDate === '1') return;
    if (input.closest('.thai-date-picker')) return;
    input.dataset.thaiDateEnhanced = '1';

    const wrap = document.createElement('span');
    wrap.className = 'thai-global-date';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'form-control thai-global-date-button';
    if (input.classList.contains('form-control-sm')) button.classList.add('form-control-sm');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span class="date-text"></span><span class="date-icon">📅</span>';
    wrap.appendChild(button);

    input.classList.add('thai-global-date-native');
    input._thaiDateButton = button;
    updateButton(input);

    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (activeInput === input && !getPopover().classList.contains('hidden')) close();
      else open(input, button);
    });
    input.addEventListener('focus', function() { open(input, button); });
    input.addEventListener('input', function() { updateButton(input); });
    input.addEventListener('change', function() { updateButton(input); });
  }

  function enhance(root) {
    const base = root || document;
    base.querySelectorAll('input[type="date"]').forEach(enhanceInput);
  }

  function startObserver() {
    if (observerStarted) return;
    observerStarted = true;
    document.addEventListener('click', function(e) {
      const pop = document.getElementById('thaiGlobalDatePopover');
      if (!pop || pop.classList.contains('hidden')) return;
      if (pop.contains(e.target)) return;
      if (activeButton && activeButton.contains(e.target)) return;
      close();
    }, true);
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
    const frame = document.getElementById('contentFrame');
    if (frame) {
      new MutationObserver(function() { enhance(frame); }).observe(frame, { childList: true, subtree: true });
    }
    enhance(document);
  }

  return {
    enhance: enhance,
    startObserver: startObserver,
    formatThai: formatThai
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { window.ThaiDatePicker.startObserver(); });
} else {
  window.ThaiDatePicker.startObserver();
}

window.handleLoadError = function(action, pageName) {
  switch (action) {
    case 'retry': if (pageName) { showMainLoading(); loadPage(pageName).catch(() => showLoadError(pageName)); } break;
    case 'home_hub': showMainLoading(); loadPage('home_hub').catch(() => showLoadError('home_hub')); break;
    case 'dashboard': showMainLoading(); loadPage('dashboard').catch(() => showLoadError('dashboard')); break;
    case 'reload': window.location.reload(true); break;
    case 'logout': if (confirm('ต้องการออกจากระบบหรือไม่?')) { if (typeof window.logout === 'function') window.logout(); else { localStorage.clear(); showRedirectButton(_buildLoginUrl('')); } } break;
  }
};

/* =========================
   UNIVERSAL AUTO-SELECT FOR SINGLE ROOM (UX ENHANCEMENT)
========================= */
function enhanceUniversalGradeClassAutoSelect_(root) {
  const container = root || document.getElementById('contentFrame') || document.body;
  if (!container) return;

  function isClassSelect(el) {
    if (!el || el.tagName !== 'SELECT') return false;
    const key = (el.id + ' ' + el.name + ' ' + el.className).toLowerCase();
    return /class|room|ห้อง/i.test(key) && !/classifier|bootstrap|form-control-sm/i.test(key);
  }

  function isGradeSelect(el) {
    if (!el || el.tagName !== 'SELECT') return false;
    const key = (el.id + ' ' + el.name + ' ' + el.className).toLowerCase();
    return /grade|ชั้น/i.test(key) && !/bootstrap/i.test(key);
  }

  function autoSelectClass(classEl, force) {
    if (!classEl || classEl.disabled) return;
    const options = Array.from(classEl.options || []).filter(opt => {
      const val = String(opt.value || '').trim();
      const txt = String(opt.textContent || '').trim();
      return val !== '' && !/เลือก|ทั้งหมด|ทุกห้อง|กำลัง|loading/i.test(txt);
    });

    if (options.length === 0) return;

    if (!force && classEl.value && options.some(o => o.value === classEl.value)) {
      return;
    }

    const saved = window.GradeClassHelper?.loadSelection?.();
    const preferred = String(classEl.dataset.gcPreferredClassNo || saved?.classNo || '1').trim();

    let targetVal = '';
    if (options.some(o => o.value === preferred)) {
      targetVal = preferred;
    } else if (options.some(o => o.value === '1')) {
      targetVal = '1';
    } else if (options.length === 1) {
      targetVal = options[0].value;
    } else if (options.length > 0) {
      targetVal = options[0].value;
    }

    if (targetVal && (force || !classEl.value || classEl.value === '')) {
      if (classEl.value !== targetVal) {
        classEl.value = targetVal;
        classEl._lastAutoSelected = targetVal;
        classEl.dispatchEvent(new Event('change', { bubbles: true }));
        classEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  function runCheck() {
    const classSelects = Array.from(container.querySelectorAll('select')).filter(isClassSelect);
    classSelects.forEach(sel => autoSelectClass(sel, false));
  }

  const selects = Array.from(container.querySelectorAll('select'));
  selects.forEach(sel => {
    if (isClassSelect(sel)) {
      autoSelectClass(sel, false);
    }
    if (isGradeSelect(sel) && !sel._autoSelectAttached) {
      sel._autoSelectAttached = true;
      sel.addEventListener('change', () => {
        const parent = sel.closest('form') || sel.closest('.card') || sel.closest('.att-filter-card') || sel.closest('.row') || container;
        const relatedClassSelect = parent.querySelector('select:not(#' + (sel.id || '__sel') + ')');
        if (relatedClassSelect && isClassSelect(relatedClassSelect)) {
          autoSelectClass(relatedClassSelect, true);
        }
        [60, 180, 400, 800].forEach(delay => setTimeout(runCheck, delay));
      });
    }
  });

  runCheck();
  [120, 350, 750].forEach(delay => setTimeout(runCheck, delay));
}

/* =========================
   PAGE LOADER
========================= */
// Parents get a results-only app: any other page (home_hub, teacher tools,
// a bookmarked URL) opens the parent portal instead. RLS already limits the
// data; this keeps the menus a parent sees to the pages meant for them.
const PARENT_PAGES_ = ['parent_portal', 'change_password', 'help_page'];
function isParentSession_() {
  try { return String(localStorage.getItem('role') || '').toLowerCase() === 'parent'; } catch (_) { return false; }
}

function normalizeRetiredPage_(page) {
  // หน้าคลังข้อมูลรายปี/จัดการปีการศึกษาแบบเดิมทำงานกับชีต Google (สำรอง/ดึงชีตปีเก่า) ซึ่งไม่มีแล้ว
  // ระบบฐานข้อมูลแก้ข้อมูลปีเก่าได้โดยตรงที่หน้า "ข้อมูลย้อนหลัง" โดยไม่ต้องสลับปีของโรงเรียน
  const RETIRED_PAGE_TARGETS_ = { warehouse_tools: 'student_scores_summary', year_database_vault: 'academic_history', academic_year_tools: 'academic_history' };
  const resolved = Object.prototype.hasOwnProperty.call(RETIRED_PAGE_TARGETS_, page) ? RETIRED_PAGE_TARGETS_[page] : page;
  if (typeof resolved === 'string' && resolved !== 'login' && resolved !== 'forgot_password'
    && isParentSession_() && !PARENT_PAGES_.includes(resolved)) {
    return 'parent_portal';
  }
  return resolved;
}

function retireLegacyScoreWarehouseUi_(root) {
  const base = root || document;
  base.querySelectorAll('[data-page="warehouse_tools"], a[onclick*="warehouse_tools"]').forEach(function(node) {
    const target = node.closest?.('.nav-item') || node;
    target.remove();
  });
  base.querySelectorAll('h3').forEach(function(heading) {
    if (!heading.textContent?.includes('คลังคะแนนรวม')) return;
    const description = heading.nextElementSibling;
    if (description?.tagName === 'P') description.remove();
    heading.remove();
  });
}
function loadPage(page) {
  page = normalizeRetiredPage_(page);
  // "พิมพ์ ปพ.6 แบบมีคะแนน" is the ปพ.6 page under its own id (own menu item and banner);
  // enhanceSupabaseReportCardGeneratorPage_ marks it so the PDF gets the "คะแนนที่ได้" column.
  if (page === 'report_card_scores' && window.GAS_PAGES?.report_card_generator && !window.GAS_PAGES.report_card_scores) {
    window.GAS_PAGES.report_card_scores = window.GAS_PAGES.report_card_generator;
  }
  if (typeof page !== 'string' || (!Object.prototype.hasOwnProperty.call(window.GAS_PAGES || {}, page) && page !== 'academic_calendar')) {
    showLoadError(page);
    return Promise.reject(new Error('ไม่พบหน้าที่ร้องขอ'));
  }
  if (page === 'one_page_report') {
    try { localStorage.setItem('pp6_report_format', 'single'); } catch(_) {}
    page = 'report_card_generator';
    updateURL(page);
    setActivePage(page);
  }
  if (window.AppNavigation.isLoading) {
    return Promise.resolve();
  }
  window.AppNavigation.isLoading = true;
  window.NavGuard.isLoadingSince = Date.now();

  const LOAD_TIMEOUT_MS = 12000;
  return new Promise((resolve, reject) => {
    const watchdog = setTimeout(() => {
      console.error('⏰ Load timeout');
      window.AppNavigation.isLoading = false;
      window.NavGuard.isLoadingSince = 0;
      showLoadError(page);
      reject(new Error('Timeout'));
    }, LOAD_TIMEOUT_MS);

    if (typeof google === 'undefined' || !google.script?.run) {
      clearTimeout(watchdog);
      console.error('❌ google.script.run not available');
      window.AppNavigation.isLoading = false;
      window.NavGuard.isLoadingSince = 0;
      showLoadError(page);
      return reject(new Error('Google Apps Script not available'));
    }

    // console.log('🔄 Calling google.script.run.include(' + page + ')');
    google.script.run
      .withSuccessHandler(html => {
        // console.log('✅ Page loaded, HTML length:', html?.length);
        try {
          const frame = document.getElementById('contentFrame');
          if (!frame) throw new Error('Content frame not found');
          const isAuthPage = page === 'login' || page === 'forgot_password';
          if (isAuthPage) {
            frame.classList.remove('content-card');
            document.body.classList.toggle('pp5-public-auth-page', true);
            document.body.classList.toggle('pp5-login-page', page === 'login');
          } else {
            frame.classList.add('content-card');
            document.body.classList.remove('pp5-public-auth-page', 'pp5-login-page');
          }
          if (html.includes('<script') && !html.includes('</body>')) {
            const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
            frame.innerHTML = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            retireLegacyScoreWarehouseUi_(frame);
            frame.classList.add('animate-fade-in');
            installPageScriptsAfterDomReady_(page, async () => {
              for (const [full, code] of scripts) {
                const s = document.createElement('script');
                const old = new DOMParser().parseFromString(full, 'text/html').querySelector('script');
                if (old?.src) {
                  const absoluteSrc = new URL(old.src, document.baseURI).href;
                  const existing = [...document.scripts].find((item) => item.src === absoluteSrc);
                  if (existing || isDuplicateSharedLibrary_(absoluteSrc)) continue;
                  s.src = absoluteSrc;
                  await new Promise((resolveScript, rejectScript) => {
                    s.addEventListener('load', resolveScript, { once: true });
                    s.addEventListener('error', () => rejectScript(new Error(`โหลด script ไม่สำเร็จ: ${absoluteSrc}`)), { once: true });
                    document.body.appendChild(s);
                  });
                } else {
                  s.textContent = code;
                  document.body.appendChild(s);
                }
              }
              if (page === 'attendance_daily') enhanceSupabaseAttendanceDailyPage_();
              if (page === 'import') enhanceSupabaseDmcImportPage_();
              if (page === 'export_pdf_page') enhanceSupabaseStudentExportPage_();
              if (page === 'create_score_sheet') enhanceSupabaseScoreSheetPage_();
              if (page === 'score_table_viewer') enhanceSupabaseScoreEntryPage_();
              if (page === 'change_password') enhanceSupabaseChangePasswordPage_();
              if (page === 'student_growth_entry') enhanceSupabaseStudentGrowthEntryPage_();
              if (page === 'student_growth_report') window.PP5GrowthExport?.enhance(document.getElementById('contentFrame'));
              if (page === 'admin_panel') enhanceSupabaseAdminUsersPage_();
              if (page === 'student_scores_summary') enhanceSupabaseStudentScoresSummaryPage_();
              if (page === 'report_card_generator' || page === 'report_card_scores') enhanceSupabaseReportCardGeneratorPage_(page === 'report_card_scores');
              if (page === 'parent_portal') enhanceSupabaseParentPortalPage_();
              if (page === 'pp5_full_book') enhanceSupabasePp5FullBookPage_();
              if (['characteristic_assessment', 'competency_assessment', 'activity_assessment', 'read_think_write_form', 'rtw5_assessment'].includes(page)) enhanceSupabaseAssessmentPresetsPage_(page);
            }).catch((error) => console.error('Page script load failed:', page, error));
          } else {
            frame.innerHTML = html;
            retireLegacyScoreWarehouseUi_(frame);
            frame.classList.add('animate-fade-in');
            requestAnimationFrame(() => {
              if (typeof executePageScripts === 'function') try { executePageScripts(frame, page); } catch (_) {}
              if (page === 'login') enhanceSupabaseLoginPage_();
              if (page === 'forgot_password') enhanceSupabaseForgotPasswordPage_();
              if (page === 'attendance_daily') enhanceSupabaseAttendanceDailyPage_();
              if (page === 'new_settings_editor') enhanceSupabaseSettingsPage_();
              if (page === 'import') enhanceSupabaseDmcImportPage_();
              if (page === 'export_pdf_page') enhanceSupabaseStudentExportPage_();
              if (page === 'create_score_sheet') enhanceSupabaseScoreSheetPage_();
              if (page === 'score_table_viewer') enhanceSupabaseScoreEntryPage_();
              if (page === 'student_growth_entry') enhanceSupabaseStudentGrowthEntryPage_();
              if (page === 'student_growth_report') window.PP5GrowthExport?.enhance(document.getElementById('contentFrame'));
              if (page === 'admin_panel') enhanceSupabaseAdminUsersPage_();
              if (page === 'student_scores_summary') enhanceSupabaseStudentScoresSummaryPage_();
              if (page === 'parent_portal') enhanceSupabaseParentPortalPage_();
              if (page === 'pp5_full_book') enhanceSupabasePp5FullBookPage_();
              if (['characteristic_assessment', 'competency_assessment', 'activity_assessment', 'read_think_write_form', 'rtw5_assessment'].includes(page)) enhanceSupabaseAssessmentPresetsPage_(page);
            });
          }
          window.AppNavigation.currentPage = page;
          if (page === 'login') enhanceSupabaseLoginPage_();
          if (page === 'forgot_password') enhanceSupabaseForgotPasswordPage_();
          if (page === 'change_password') enhanceSupabaseChangePasswordPage_();
          if (page === 'attendance_daily') enhanceSupabaseAttendanceDailyPage_();
          if (page === 'new_settings_editor') enhanceSupabaseSettingsPage_();
          if (page === 'import') enhanceSupabaseDmcImportPage_();
          if (page === 'export_pdf_page') enhanceSupabaseStudentExportPage_();
          if (page === 'create_score_sheet') enhanceSupabaseScoreSheetPage_();
          if (page === 'score_table_viewer') enhanceSupabaseScoreEntryPage_();
          if (page === 'student_growth_entry') enhanceSupabaseStudentGrowthEntryPage_();
              if (page === 'student_growth_report') window.PP5GrowthExport?.enhance(document.getElementById('contentFrame'));
          if (page === 'admin_panel') enhanceSupabaseAdminUsersPage_();
          if (page === 'student_scores_summary') enhanceSupabaseStudentScoresSummaryPage_();
          if (page === 'report_card_generator' || page === 'report_card_scores') enhanceSupabaseReportCardGeneratorPage_(page === 'report_card_scores');
          if (page === 'pp5_full_book') enhanceSupabasePp5FullBookPage_();
          if (page === 'schoolmis_sync') enhanceSupabaseSchoolMisPage_();
          if (page === 'subjectManager') enhanceSupabaseSubjectManagerPage_();
          if (page === 'attendance_monthly') enhanceSupabaseAttendanceMonthlyPage_();
          if (page === 'home_hub') enhanceSupabaseHomeHubPage_();
          if (page === 'dashboard') enhanceSupabaseDashboardPage_();
          if (['characteristic_assessment', 'competency_assessment', 'activity_assessment', 'read_think_write_form', 'rtw5_assessment'].includes(page)) enhanceSupabaseAssessmentPresetsPage_(page);

          // Auto-init GradeClassHelper สำหรับทุกหน้าที่มี dropdown ชั้น/ห้อง
          setTimeout(() => {
            if (window.GradeClassHelper) {
              const pairs = [
                ['gradeSelect', 'classSelect'],
                ['table-grade', 'table-class'],
                ['scoreEntryGradeSelect', 'scoreEntryClassSelect'],
                ['filterGrade', 'filterClass'],
                ['cssGradeSelect', 'cssClassSelect'],
                ['casGradeSelect', 'casClassSelect'],
                ['whGrade', 'whClassNo'],
                ['whGrade', 'whClass'],
                ['deleteGrade', 'deleteClass'],
                ['grade', 'classNo'],
                ['searchGrade', 'searchClass'],
                ['selectGrade', 'selectClass'],
                ['pp5aGrade', 'pp5aClass'],
                ['pp5fbGrade', 'pp5fbClass'],
                ['pp5rGrade', 'pp5rClass'],
                ['sgGrade', 'sgClass'],
                ['grGrade', 'grClass'],
                ['studentGrade', 'studentClassNo'],
                ['attGradeSelect', 'attRoomSelect']
              ];
              pairs.forEach(function(pair) {
                if (document.getElementById(pair[0])) {
                  window.GradeClassHelper.init({
                    gradeId: pair[0],
                    classId: pair[1],
                    noQuickBar: page === 'semester_attendance_summary'
                  });
                }
              });
            }
          }, 300);

          setTimeout(() => {
            if (window.ThaiDatePicker) window.ThaiDatePicker.enhance(frame);
            enhanceUniversalGradeClassAutoSelect_(frame);
          }, 80);
          
          resolve();
        } catch (e) {
          console.error('❌ Error processing page:', e);
          showLoadError(page);
          reject(e);
        } finally {
          clearTimeout(watchdog);
          window.AppNavigation.isLoading = false;
          window.NavGuard.isLoadingSince = 0;
        }
      })
      .withFailureHandler(err => {
        console.error('❌ google.script.run failed:', err);
        clearTimeout(watchdog);
        showLoadError(page);
        reject(err);
        window.AppNavigation.isLoading = false;
        window.NavGuard.isLoadingSince = 0;
      })
      .include(page);
  });
}
window.loadPage = loadPage;

// Supabase score rows distinguish "not entered" from an intentional score of
// zero.  The legacy UI assumed every zero-filled database row was completed and
// also divided annual scores only when both values were greater than zero. This
// enhancer keeps the familiar table while making completion, averages and
// grades reflect the saved state supplied by the Supabase bridge.
function enhanceSupabaseScoreEntryPage_() {
  const system = window.ScoreEntrySystem;
  const frame = document.getElementById('contentFrame');
  if (!system || !frame?.querySelector('#scoreEntryTerm1Container')) return;

  const numberValue = function(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const displayNumber = function(value) {
    const rounded = Math.round(numberValue(value) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
  };
  const gradeFor = function(total) {
    const calculateGrade = window.PP5Data?.helpers?.calculateGrade;
    if (typeof calculateGrade === 'function') return String(calculateGrade(total));
    const score = Math.round(numberValue(total) + Number.EPSILON);
    if (score >= 80) return '4';
    if (score >= 75) return '3.5';
    if (score >= 70) return '3';
    if (score >= 65) return '2.5';
    if (score >= 60) return '2';
    if (score >= 55) return '1.5';
    if (score >= 50) return '1';
    return '0';
  };

  const syncTermRowGrade = function(row) {
    const totalCell = row.querySelector('.score-entry-total');
    const gradeCell = row.querySelector('.score-entry-grade');
    if (!totalCell || !gradeCell) return;
    const hasScore = [...row.querySelectorAll('.score-entry-input, .score-entry-final-input')]
      .some(input => String(input.value ?? '').trim() !== '');
    const grade = hasScore ? gradeFor(totalCell.textContent) : '—';
    const badge = gradeCell.querySelector('.score-entry-grade-badge') || document.createElement('span');
    if (!badge.parentElement) gradeCell.appendChild(badge);
    badge.textContent = grade;
    badge.className = `score-entry-grade-badge score-entry-grade-${hasScore ? grade.replace('.', '-') : 'pending'}`;
  };

  const syncTermGrades = function(container) {
    container.querySelectorAll('tbody tr[data-student-id]').forEach(syncTermRowGrade);
  };


  const updateStats = function(tabId) {
    if (typeof system.updateStats === 'function') { system.updateStats(tabId); return; }
    const totalEl = frame.querySelector('#totalStudents');
    const completedEl = frame.querySelector('#completedScores');
    const averageEl = frame.querySelector('#avgScore');
    const passEl = frame.querySelector('#passRate');
    const grade4El = frame.querySelector('#grade4count');
    const below2El = frame.querySelector('#gradeBelow2Count');
    const progressEl = frame.querySelector('#scoreEntryProgressBar');
    const containerId = tabId === 'scoreEntryTerm2Tab'
      ? 'scoreEntryTerm2Container'
      : tabId === 'scoreEntryCombinedTab' ? 'scoreEntryCombinedContainer' : 'scoreEntryTerm1Container';
    const rows = [...frame.querySelectorAll(`#${containerId} tbody tr`)];
    if (!rows.length) return;

    const completed = rows.filter(function(row) {
      if (tabId === 'scoreEntryCombinedTab') return row.dataset.scoreComplete === 'true';
      return [...row.querySelectorAll('.score-entry-input, .score-entry-final-input')]
        .some((input) => String(input.value ?? '').trim() !== '');
    });
    const totals = completed.map(function(row) {
      return numberValue(row.querySelector('.score-entry-total')?.textContent);
    });
    const grades = completed.map(function(row, index) {
      return String(row.querySelector('.score-entry-grade-badge')?.textContent || gradeFor(totals[index])).trim();
    });
    const average = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0;
    const passCount = totals.filter((value) => value >= 50).length;

    if (totalEl) totalEl.textContent = String(rows.length);
    if (completedEl) completedEl.textContent = String(completed.length);
    if (averageEl) averageEl.textContent = totals.length ? average.toFixed(1) : '0';
    if (passEl) passEl.textContent = totals.length ? `${Math.round(passCount * 100 / totals.length)}%` : '0%';
    if (grade4El) grade4El.textContent = String(grades.filter((grade) => grade === '4').length);
    if (below2El) below2El.textContent = String(grades.filter((grade) => ['0', '1', '1.5'].includes(grade)).length);
    if (progressEl) progressEl.style.width = `${rows.length ? Math.round(completed.length * 100 / rows.length) : 0}%`;
  };

  const isStudentTermEntered_ = function(termRow, containerId, studentId) {
    if (!termRow) return false;
    const domContainer = frame.querySelector(`#${containerId}`);
    if (domContainer) {
      const domTr = domContainer.querySelector(`tbody tr[data-student-id="${studentId}"]`);
      if (domTr) {
        const domInputs = [...domTr.querySelectorAll('.score-entry-input, .score-entry-final-input')];
        if (domInputs.length > 0) {
          const hasAnyDomValue = domInputs.some((i) => String(i.value ?? '').trim() !== '');
          if (!hasAnyDomValue) return false;
        }
      }
    }
    if (!termRow.saved) return false;
    const scores = Array.isArray(termRow.scores) ? termRow.scores : [];
    const hasScore = scores.some((s) => numberValue(s) > 0)
      || numberValue(termRow.mid) > 0
      || numberValue(termRow.final) > 0
      || numberValue(termRow.total) > 0;
    return hasScore || (termRow.saved === true && scores.every((value) => numberValue(value) === 0));
  };

  const patchCombinedTable = function(containerId) {
    const current = system.getCurrentData?.();
    const container = frame.querySelector(`#${containerId || 'scoreEntryCombinedContainer'}`);
    if (!current || !container) return;
    const term1 = new Map((current.term1?.rows || []).map((row) => [String(row.id), row]));
    const term2 = new Map((current.term2?.rows || []).map((row) => [String(row.id), row]));

    container.querySelectorAll('tbody tr[data-student-id]').forEach(function(row) {
      const id = String(row.dataset.studentId || '');
      const first = term1.get(id);
      const second = term2.get(id);
      const firstEntered = isStudentTermEntered_(first, 'scoreEntryTerm1Container', id);
      const secondEntered = isStudentTermEntered_(second, 'scoreEntryTerm2Container', id);
      const complete = Boolean(first?.saved && second?.saved && firstEntered && secondEntered);
      row.dataset.scoreComplete = complete ? 'true' : 'false';
      row.classList.toggle('score-entry-incomplete', !complete);
      const cells = row.children;
      if (!complete) {
        for (let index = 3; index < cells.length; index += 1) cells[index].textContent = '—';
        row.title = 'รอคะแนนให้ครบ 2 ภาคเรียน';
        return;
      }

      row.removeAttribute('title');
      const scores = Array.from({ length: 9 }, function(_item, index) {
        return Math.round(((numberValue(first.scores?.[index]) + numberValue(second.scores?.[index])) / 2) * 100) / 100;
      });
      const sum14 = scores.slice(0, 4).reduce((sum, value) => sum + value, 0);
      const sum69 = scores.slice(5, 9).reduce((sum, value) => sum + value, 0);
      const mid = Math.round(((numberValue(first.mid) + numberValue(second.mid)) / 2) * 100) / 100;
      const finalScore = Math.round(((numberValue(first.final) + numberValue(second.final)) / 2) * 100) / 100;
      // Match the established annual rounding used by class reports and SAR.
      const total = Math.round((numberValue(first.total) + numberValue(second.total)) / 2);
      const grade = gradeFor(total);
      const values = [scores[0], scores[1], scores[2], scores[3], sum14, scores[4], scores[5], scores[6], scores[7], scores[8], sum69, mid, finalScore, total, grade];
      values.forEach(function(value, offset) {
        if (cells[3 + offset]) cells[3 + offset].textContent = displayNumber(value);
      });
      const gradeCell = cells[17];
      if (gradeCell) {
        gradeCell.className = 'score-entry-grade';
        gradeCell.innerHTML = `<span class="score-entry-grade-badge score-entry-grade-${grade.replace('.', '-')}">${grade}</span>`;
      }
    });
    updateStats('scoreEntryCombinedTab');
  };

  if (window.__pp5SupabaseScoreEntryPatchedSystem !== system) {
    const originalRenderCombined = system.renderCombined.bind(system);
    system.renderCombined = function(containerId) {
      originalRenderCombined(containerId);
      patchCombinedTable(containerId);
    };
    window.__pp5SupabaseScoreEntryPatchedSystem = system;
  }

  const combinedContainer = frame.querySelector('#scoreEntryCombinedContainer');
  if (combinedContainer && !combinedContainer.dataset.supabasePatchedObserver) {
    combinedContainer.dataset.supabasePatchedObserver = 'ready';
    const observer = new MutationObserver(function() {
      if (combinedContainer.querySelector('tbody tr[data-student-id]:not([data-score-complete])')) {
        patchCombinedTable('scoreEntryCombinedContainer');
      }
    });
    observer.observe(combinedContainer, { childList: true, subtree: true });
  }

  ['scoreEntryTerm1Container', 'scoreEntryTerm2Container'].forEach(function(containerId) {
    const container = frame.querySelector(`#${containerId}`);
    if (!container || container.dataset.supabaseGradeRoundingObserver) return;
    container.dataset.supabaseGradeRoundingObserver = 'ready';
    let timer;
    const isTotalCell = function(node) {
      return node?.nodeType === 1 && node.classList?.contains('score-entry-total');
    };
    const scheduleSync = function() {
      clearTimeout(timer);
      timer = setTimeout(function() { syncTermGrades(container); }, 0);
    };
    const observer = new MutationObserver(function(mutations) {
      const totalChanged = mutations.some(function(mutation) {
        if (mutation.type === 'characterData') return isTotalCell(mutation.target.parentElement);
        if (mutation.type !== 'childList') return false;
        return isTotalCell(mutation.target) || [...mutation.addedNodes].some(function(node) {
          return isTotalCell(node) || Boolean(node.querySelector?.('.score-entry-total'));
        });
      });
      if (totalChanged) scheduleSync();
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    syncTermGrades(container);
  });

  ['scoreEntryTerm1Tab', 'scoreEntryTerm2Tab', 'scoreEntryCombinedTab'].forEach(function(tabId) {
    const tab = frame.querySelector(`#${tabId}`);
    if (!tab || tab.dataset.supabaseScoreStats === 'ready') return;
    tab.dataset.supabaseScoreStats = 'ready';
    tab.addEventListener('click', function() {
      setTimeout(function() {
        if (tabId === 'scoreEntryCombinedTab') system.renderCombined('scoreEntryCombinedContainer');
        else {
          updateStats(tabId);
          installScoreColumnAutofill_(frame.querySelector('#scoreEntryTerm1Container'));
          installScoreColumnAutofill_(frame.querySelector('#scoreEntryTerm2Container'));
        }
      }, 80);
    });
  });
  window.PP5ScoreDrafts?.install(frame, system);

  const scoreFillUndoState = frame.__pp5ScoreFillUndoState || { history: [], applying: false };
  frame.__pp5ScoreFillUndoState = scoreFillUndoState;

  const showScoreToast_ = function(msg, type, onUndo) {
    document.getElementById('pp5ScoreToast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'pp5ScoreToast';
    const bg = type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b82f6';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: ${bg};
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(0,0,0,0.18);
      z-index: 10080;
      font-family: Sarabun, sans-serif;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: opacity 0.3s;
    `;
    const icon = type === 'success' ? '<i class="bi bi-check-circle-fill"></i>' : '<i class="bi bi-exclamation-triangle-fill"></i>';
    toast.innerHTML = `${icon} <span>${msg}</span>`;
    if (onUndo) {
      const undoButton = document.createElement('button');
      undoButton.type = 'button';
      undoButton.className = 'btn btn-sm btn-light';
      undoButton.textContent = 'ยกเลิก (Ctrl+Z)';
      undoButton.addEventListener('click', onUndo);
      toast.appendChild(undoButton);
    }
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 350);
    }, onUndo ? 8000 : 2400);
  };

  const scoreContextKey_ = function() {
    const context = window.ScoreEntrySystem?.getCurrentData?.()?.context;
    return JSON.stringify([context?.academicYear, context?.grade, context?.classNo, context?.subjectCode]);
  };
  const undoLatestColumnFill_ = function() {
    const action = scoreFillUndoState.history.at(-1);
    if (!action) {
      showScoreToast_('ไม่มีการเติมคะแนนให้ยกเลิก', 'warning');
      return false;
    }
    if (!action.table.isConnected || !frame.contains(action.table) || action.contextKey !== scoreContextKey_()
      || action.changes.some(change => !change.input.isConnected || change.input.value !== change.next)) {
      scoreFillUndoState.history.length = 0;
      showScoreToast_('ตารางคะแนนเปลี่ยนไปแล้ว กรุณาตรวจค่าก่อนแก้ไขต่อ', 'warning');
      return false;
    }

    scoreFillUndoState.history.pop();
    scoreFillUndoState.applying = true;
    try {
      action.changes.forEach(function(change) {
        change.input.value = change.previous;
        change.input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } finally {
      scoreFillUndoState.applying = false;
    }
    showScoreToast_(`ย้อนกลับการเติม ${action.colTitle} แล้ว (${action.changes.length} คน) — กดบันทึกเพื่อยืนยัน`,
      'success', scoreFillUndoState.history.length ? undoLatestColumnFill_ : null);
    return true;
  };

  if (!scoreFillUndoState.listenersInstalled) {
    scoreFillUndoState.listenersInstalled = true;
    frame.addEventListener('input', function(event) {
      if (!scoreFillUndoState.applying && event.target.matches?.('.score-entry-input, .score-entry-final-input, .score-entry-full-score')) {
        scoreFillUndoState.history.length = 0;
      }
    });
    frame.addEventListener('click', function(event) {
      if (event.target.closest?.('#scoreEntryBtnSaveTerm1, #scoreEntryBtnSaveTerm2')) {
        scoreFillUndoState.history.length = 0;
      }
    });
  }
  if (window.__pp5ScoreFillUndoHandler) document.removeEventListener('keydown', window.__pp5ScoreFillUndoHandler, true);
  window.__pp5ScoreFillUndoHandler = function(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'z'
      || event.defaultPrevented || !scoreFillUndoState.history.length || !frame.querySelector('#scoreEntryTerm1Container')) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement && !frame.contains(active)) return;
    if (event.target.closest?.('textarea, [contenteditable="true"], input:not(.score-entry-input):not(.score-entry-final-input)')) return;
    event.preventDefault();
    undoLatestColumnFill_();
  };
  document.addEventListener('keydown', window.__pp5ScoreFillUndoHandler, true);

  const getColTitle_ = function(isFinal, colIndex) {
    if (isFinal) return 'ครั้งที่ 10 (สอบปลายภาค)';
    const idx = Number(colIndex);
    if (idx === 4) return 'ครั้งที่ 5 (สอบกลางภาค)';
    if (idx >= 0 && idx <= 3) return `ครั้งที่ ${idx + 1}`;
    if (idx >= 5 && idx <= 8) return `ครั้งที่ ${idx + 1}`;
    return `ช่องที่ ${idx + 1}`;
  };

  const requestCustomScore_ = function(colTitle, currentMax, defaultMode = 'empty-or-zero') {
    return new Promise(function(resolve) {
      document.getElementById('pp5ScoreCustomDialog')?.remove();

      const dialog = document.createElement('div');
      dialog.id = 'pp5ScoreCustomDialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'pp5ScoreCustomDialogTitle');
      dialog.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 10090;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(15, 23, 42, 0.42);
        font-family: Sarabun, sans-serif;
      `;
      dialog.innerHTML = `
        <form style="width: min(100%, 380px); padding: 22px; border-radius: 14px; background: #fff; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);">
          <div id="pp5ScoreCustomDialogTitle" style="font-size: 17px; font-weight: 700; color: #0f172a;">กำหนดคะแนน ${colTitle}</div>
          <p style="margin: 6px 0 14px; color: #64748b; font-size: 13px;">ระบุคะแนน 0 ถึง ${currentMax} (รองรับทศนิยม เช่น 2.5, 3.5)</p>

          <div style="margin-bottom: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px;">
            <div style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px;">เป้าหมายที่ต้องการเติม:</div>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1e293b; cursor: pointer; margin-bottom: 6px;">
              <input type="radio" name="pp5CustomTarget" value="custom-empty-or-zero" ${defaultMode !== 'empty' && defaultMode !== 'all' ? 'checked' : ''} style="cursor: pointer;">
              <span>ใส่ช่องว่างและช่องที่เป็น 0 (แนะนำสำหรับช่องที่ยังไม่กรอก)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1e293b; cursor: pointer; margin-bottom: 6px;">
              <input type="radio" name="pp5CustomTarget" value="custom-empty" ${defaultMode === 'empty' ? 'checked' : ''} style="cursor: pointer;">
              <span>ใส่เฉพาะช่องว่างจริง ๆ (ไม่เปลี่ยนคะแนน 0)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1e293b; cursor: pointer;">
              <input type="radio" name="pp5CustomTarget" value="custom" ${defaultMode === 'all' ? 'checked' : ''} style="cursor: pointer;">
              <span>ใส่ให้นักเรียนทุกคนในห้อง</span>
            </label>
          </div>

          <label for="pp5ScoreCustomValue" style="display: block; margin-bottom: 6px; color: #334155; font-size: 13px; font-weight: 600;">คะแนนที่ต้องการใส่ (ไม่จำกัดเฉพาะจำนวนเต็ม)</label>
          <input id="pp5ScoreCustomValue" type="number" min="0" max="${currentMax}" step="any" inputmode="decimal" placeholder="เช่น 2.5" required style="width: 100%; height: 42px; padding: 8px 10px; border: 1px solid #94a3b8; border-radius: 8px; color: #0f172a; font: inherit;">
          <div style="font-size: 11.5px; color: #64748b; margin-top: 4px;">* สามารถกรอกทศนิยมได้ เช่น 1.5, 2.5, 3.5 (สูงสุด ${currentMax} คะแนน)</div>
          <div data-score-custom-error style="min-height: 20px; margin-top: 4px; color: #dc2626; font-size: 12px;"></div>
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px;">
            <button type="button" data-score-custom-cancel class="btn btn-outline-secondary btn-sm">ยกเลิก</button>
            <button type="submit" class="btn btn-primary btn-sm"><i class="bi bi-check2"></i> ใส่คะแนน</button>
          </div>
        </form>
      `;

      const form = dialog.querySelector('form');
      const input = dialog.querySelector('#pp5ScoreCustomValue');
      const error = dialog.querySelector('[data-score-custom-error]');
      let settled = false;
      const close = function(value) {
        if (settled) return;
        settled = true;
        dialog.remove();
        resolve(value);
      };
      const validate = function() {
        const raw = String(input?.value ?? '').trim().replace(',', '.');
        const value = Number(raw);
        if (raw === '' || !Number.isFinite(value) || value < 0 || value > currentMax) {
          if (error) error.textContent = `คะแนนต้องอยู่ระหว่าง 0 ถึง ${currentMax}`;
          input?.focus();
          return null;
        }
        const selectedMode = form?.querySelector('input[name="pp5CustomTarget"]:checked')?.value || (defaultMode === 'all' ? 'custom' : (defaultMode === 'empty' ? 'custom-empty' : 'custom-empty-or-zero'));
        return { value, mode: selectedMode };
      };

      form?.addEventListener('submit', function(event) {
        event.preventDefault();
        const value = validate();
        if (value !== null) close(value);
      });
      dialog.querySelector('[data-score-custom-cancel]')?.addEventListener('click', function() { close(null); });
      dialog.addEventListener('click', function(event) {
        if (event.target === dialog) close(null);
      });
      dialog.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') close(null);
      });

      document.body.appendChild(dialog);
      setTimeout(function() {
        input?.focus();
        input?.select();
      }, 0);
    });
  };

  const executeColumnFill_ = function(table, isFinal, colIndex, colTitle, mode, fillScore) {
    const studentRows = table.querySelectorAll('tbody tr[data-student-id]');
    if (!studentRows.length) {
      showScoreToast_('ไม่พบรายชื่อนักเรียนในตาราง', 'warning');
      return;
    }

    const isOnlyEmpty = mode === 'empty' || mode === 'custom-empty' || mode === 'custom-empty-or-zero';
    const includeZero = mode === 'empty' || mode === 'custom-empty-or-zero';
    const changes = [];
    studentRows.forEach(function(row) {
      const input = isFinal
        ? row.querySelector('.score-entry-final-input')
        : row.querySelector(`.score-entry-input[data-index="${colIndex}"]`);
      if (!input) return;

      const currentVal = String(input.value ?? '').trim();
      const blankForAutofill = currentVal === '' || (includeZero && Number(currentVal) === 0);
      if (isOnlyEmpty && !blankForAutofill) return;

      const nextVal = mode === 'clear' ? '' : String(fillScore);
      if (input.value !== nextVal) {
        changes.push({ input, previous: input.value, next: nextVal });
      }
    });

    if (!changes.length) {
      const msg = isOnlyEmpty
        ? `ไม่พบ${includeZero ? 'ช่องว่างหรือคะแนน 0' : 'ช่องว่าง'} ใน ${colTitle}`
        : `คะแนนใน ${colTitle} เป็นค่าที่เลือกอยู่แล้ว`;
      showScoreToast_(msg, 'warning');
      return;
    }

    scoreFillUndoState.applying = true;
    try {
      changes.forEach(function(change) {
        change.input.value = change.next;
        change.input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } finally {
      scoreFillUndoState.applying = false;
    }
    const contextKey = scoreContextKey_();
    const previousAction = scoreFillUndoState.history.at(-1);
    if (previousAction && (!previousAction.table.isConnected || previousAction.contextKey !== contextKey)) {
      scoreFillUndoState.history.length = 0;
    }
    scoreFillUndoState.history.push({ table, contextKey, colTitle, changes });
    if (scoreFillUndoState.history.length > 20) scoreFillUndoState.history.shift();

    const msg = mode === 'clear'
      ? `ล้างคะแนน ${colTitle} แล้ว (${changes.length} คน) — กดบันทึกเพื่อยืนยัน`
      : `ใส่คะแนน (${fillScore}) ใน ${colTitle} แล้ว (${changes.length} คน) — กดบันทึกเพื่อบันทึกลงระบบ`;
    showScoreToast_(msg, 'success', undoLatestColumnFill_);
  };

  const openColumnMenu_ = function(btn, table, isFinal, colIndex, colTitle, currentMax) {
    document.getElementById('pp5ScoreColMenu')?.remove();

    const rect = btn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'pp5ScoreColMenu';
    menu.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 4}px;
      left: ${Math.max(10, Math.min(rect.left - 40, window.innerWidth - 260))}px;
      width: 250px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.2), 0 8px 10px -6px rgba(15, 23, 42, 0.1);
      z-index: 10070;
      font-family: Sarabun, sans-serif;
      overflow: hidden;
      animation: pp5MenuFadeIn 0.12s ease-out;
    `;

    menu.innerHTML = `
      <div style="padding: 8px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
        <div style="font-weight: 700; font-size: 13px; color: #1e293b;">
          <i class="bi bi-lightning-charge-fill text-warning"></i> ${colTitle}
        </div>
        <div style="font-size: 11px; color: #64748b;">
          คะแนนเต็ม: <strong class="text-primary">${currentMax}</strong> คะแนน
        </div>
      </div>
      <div style="padding: 6px;">
        <button type="button" class="btn btn-sm text-start w-100 py-1.5 px-2 rounded action-fill-all" style="font-size: 12.5px; border: 0;">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-check-all text-success" style="font-size: 16px;"></i>
            <div>
              <div style="font-weight: 600; color: #0f172a;">ใส่คะแนนเต็มทุกคน</div>
              <div style="font-size: 10.5px; color: #64748b;">ใส่ ${currentMax} คะแนนให้นักเรียนทุกคน</div>
            </div>
          </div>
        </button>
        <button type="button" class="btn btn-sm text-start w-100 py-1.5 px-2 rounded action-fill-empty" style="font-size: 12.5px; border: 0;">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-pencil-square text-primary" style="font-size: 14px;"></i>
            <div>
              <div style="font-weight: 600; color: #0f172a;">ใส่คะแนนเต็มเฉพาะที่ว่าง</div>
              <div style="font-size: 10.5px; color: #64748b;">ใส่ ${currentMax} คะแนนเฉพาะช่องว่างหรือ 0</div>
            </div>
          </div>
        </button>
        <button type="button" class="btn btn-sm text-start w-100 py-1.5 px-2 rounded action-fill-custom-empty" style="font-size: 12.5px; border: 0;">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-pencil text-info" style="font-size: 14px;"></i>
            <div>
              <div style="font-weight: 600; color: #0f172a;">กำหนดคะแนนเฉพาะที่ว่าง...</div>
              <div style="font-size: 10.5px; color: #64748b;">ระบุตัวเลขเฉพาะช่องว่างและ 0 (ทศนิยมได้)</div>
            </div>
          </div>
        </button>
        <button type="button" class="btn btn-sm text-start w-100 py-1.5 px-2 rounded action-fill-custom" style="font-size: 12.5px; border: 0;">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-input-cursor text-secondary" style="font-size: 14px;"></i>
            <div>
              <div style="font-weight: 600; color: #0f172a;">กำหนดคะแนนเองทุกคน...</div>
              <div style="font-size: 10.5px; color: #64748b;">ระบุตัวเลขที่ต้องการใส่ทั้งห้อง (ทศนิยมได้)</div>
            </div>
          </div>
        </button>
        <div style="margin: 4px 0; border-top: 1px solid #f1f5f9;"></div>
        <button type="button" class="btn btn-sm text-start w-100 py-1.5 px-2 rounded text-danger action-fill-clear" style="font-size: 12.5px; border: 0;">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-trash" style="font-size: 14px;"></i>
            <div style="font-weight: 600;">ล้างคะแนนคอลัมน์นี้</div>
          </div>
        </button>
        ${scoreFillUndoState.history.length ? `<button type="button" class="btn btn-sm text-start w-100 py-1.5 px-2 rounded action-fill-undo" style="font-size: 12.5px; border: 0;">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-arrow-counterclockwise text-primary" style="font-size: 14px;"></i>
            <div style="font-weight: 600; color: #0f172a;">ยกเลิกการเติมล่าสุด (Ctrl+Z)</div>
          </div>
        </button>` : ''}
      </div>
    `;

    let menuClosed = false;
    let outsideListener;
    let keyListener;
    const closeMenu = function() {
      if (menuClosed) return;
      menuClosed = true;
      menu.remove();
      if (outsideListener) document.removeEventListener('click', outsideListener);
      if (keyListener) document.removeEventListener('keydown', keyListener);
      window.removeEventListener('scroll', outsideListener, true);
    };

    menu.querySelector('.action-fill-all')?.addEventListener('click', () => {
      closeMenu();
      executeColumnFill_(table, isFinal, colIndex, colTitle, 'all', currentMax);
    });

    menu.querySelector('.action-fill-empty')?.addEventListener('click', () => {
      closeMenu();
      executeColumnFill_(table, isFinal, colIndex, colTitle, 'empty', currentMax);
    });

    menu.querySelector('.action-fill-custom-empty')?.addEventListener('click', async () => {
      closeMenu();
      const customRes = await requestCustomScore_(colTitle, currentMax, 'empty-or-zero');
      if (customRes === null) return;
      const val = typeof customRes === 'object' && customRes !== null ? customRes.value : customRes;
      const targetMode = typeof customRes === 'object' && customRes !== null ? customRes.mode : 'custom-empty-or-zero';
      executeColumnFill_(table, isFinal, colIndex, colTitle, targetMode, val);
    });

    menu.querySelector('.action-fill-custom')?.addEventListener('click', async () => {
      closeMenu();
      const customRes = await requestCustomScore_(colTitle, currentMax, 'all');
      if (customRes === null) return;
      const val = typeof customRes === 'object' && customRes !== null ? customRes.value : customRes;
      const targetMode = typeof customRes === 'object' && customRes !== null ? customRes.mode : 'custom';
      executeColumnFill_(table, isFinal, colIndex, colTitle, targetMode, val);
    });

    menu.querySelector('.action-fill-clear')?.addEventListener('click', () => {
      closeMenu();
      if (!confirm(`ต้องการล้างคะแนนในช่อง ${colTitle} ของนักเรียนทุกคนใช่หรือไม่?`)) return;
      executeColumnFill_(table, isFinal, colIndex, colTitle, 'clear', 0);
    });

    menu.querySelector('.action-fill-undo')?.addEventListener('click', () => {
      closeMenu();
      undoLatestColumnFill_();
    });

    outsideListener = function(event) {
      if (!menu.contains(event.target) && !btn.contains(event.target) && event.target !== btn) {
        closeMenu();
      }
    };
    keyListener = function(event) {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    setTimeout(() => {
      if (menuClosed) return;
      document.addEventListener('click', outsideListener);
      document.addEventListener('keydown', keyListener);
      window.addEventListener('scroll', outsideListener, true);
    }, 10);

    document.body.appendChild(menu);
    const menuHeight = menu.getBoundingClientRect().height;
    if (rect.bottom + menuHeight + 4 > window.innerHeight) {
      menu.style.top = `${Math.max(10, rect.top - menuHeight - 4)}px`;
    }
  };

  const installScoreColumnAutofill_ = function(container) {
    if (!container) return;
    const table = container.querySelector('table.score-entry-table');
    if (!table) return;
    const fullRow = table.querySelector('.score-entry-fullscore-row');
    if (!fullRow) return;
    table.querySelectorAll('.score-entry-input, .score-entry-final-input').forEach(function(inp) {
      if (inp.getAttribute('step') !== 'any') inp.setAttribute('step', 'any');
    });

    const cells = fullRow.querySelectorAll('th');
    cells.forEach(function(th) {
      const fullInput = th.querySelector('.score-entry-full-score');
      const finalSpan = th.querySelector('.score-entry-full-final');
      if (!fullInput && !finalSpan) return;

      const isFinal = Boolean(finalSpan);
      const colIndex = isFinal ? 'final' : fullInput.getAttribute('data-index');
      const colTitle = getColTitle_(isFinal, colIndex);

      if (th.querySelector('.score-col-autofill-btn')) return;

      const btnWrap = document.createElement('div');
      btnWrap.className = 'score-col-autofill-btn-wrap';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'score-col-autofill-btn';
      btn.innerHTML = '<svg class="score-col-autofill-icon" viewBox="0 0 16 16" width="9" height="9" fill="currentColor"><path d="M5.52.359A.5.5 0 0 1 6 0h4a.5.5 0 0 1 .474.658L8.694 6H12.5a.5.5 0 0 1 .395.807l-7 9a.5.5 0 0 1-.873-.454L6.823 9.5H3.5a.5.5 0 0 1-.48-.641l2.5-8.5z"/></svg><span class="score-col-autofill-label">เติม</span><svg class="score-col-autofill-caret" viewBox="0 0 16 16" width="7" height="7" fill="currentColor"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>';
      btn.title = `คลิกเพื่อเลือกใส่คะแนน ${colTitle} ทุกคน`;

      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        document.getElementById('pp5ScoreColMenu')?.remove();

        const currentMax = isFinal
          ? Number(finalSpan.textContent || 0)
          : Number(fullInput.value || 0);

        if (!currentMax || currentMax <= 0) {
          if (!isFinal && fullInput) {
            fullInput.focus();
            fullInput.select?.();
          }
          showScoreToast_('กรุณาระบุคะแนนเต็มในช่องก่อนเติมคะแนน', 'warning');
          return;
        }

        openColumnMenu_(btn, table, isFinal, colIndex, colTitle, currentMax);
      });

      btnWrap.appendChild(btn);
      th.appendChild(btnWrap);
    });
  };


  // ── ปุ่ม PDF: ถามลำดับนักเรียนก่อนสร้าง (ชาย→หญิง หรือ เลขประจำตัว) ──
  // ดักคลิกช่วง capture ที่ frame แล้วคลิกปุ่มเดิมซ้ำหลังเลือก; gas-bridge อ่าน window.PP5ScorePdfSort
  const PDF_SORT_BUTTONS = '#scoreEntryBtnExportTerm1Pdf, #scoreEntryBtnExportTerm2Pdf, #scoreEntryBtnExportYearPdf';
  const openPdfSortMenu_ = function(button) {
    document.getElementById('pp5PdfSortMenu')?.remove();
    const current = window.PP5ScorePdfSort || window._scoreSortMode || 'gender';
    const menu = document.createElement('div');
    menu.id = 'pp5PdfSortMenu';
    const rect = button.getBoundingClientRect();
    menu.style.cssText = `position:fixed;top:${Math.min(rect.bottom + 6, window.innerHeight - 170)}px;left:${Math.max(10, Math.min(rect.left, window.innerWidth - 250))}px;width:240px;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 10px 25px -5px rgba(15,23,42,.2);z-index:10070;font-family:Sarabun,sans-serif;padding:6px;`;
    const options = [
      { mode: 'gender', icon: 'bi-gender-ambiguous', title: 'เรียงชาย → หญิง', hint: 'ชายก่อน แล้วตามเลขประจำตัว' },
      { mode: 'id', icon: 'bi-sort-numeric-down', title: 'เรียงตามเลขประจำตัว', hint: 'ไม่แยกชาย-หญิง' }
    ];
    menu.innerHTML = '<div style="padding:4px 8px 6px;font-size:12px;font-weight:700;color:#475569">ลำดับนักเรียนใน PDF</div>'
      + options.map((option) => `<button type="button" data-pdf-sort="${option.mode}" class="btn btn-sm w-100 text-start d-flex align-items-center gap-2 py-2" style="border:0;border-radius:8px;${option.mode === current ? 'background:color-mix(in srgb, var(--primary-light) 9%, #fff);' : ''}">`
        + `<i class="bi ${option.icon}" style="font-size:16px;color:var(--primary)"></i><span><span style="display:block;font-weight:600;color:#0f172a">${option.title}</span>`
        + `<span style="display:block;font-size:11px;color:#64748b">${option.hint}</span></span>${option.mode === current ? '<i class="bi bi-check2 ms-auto text-primary"></i>' : ''}</button>`).join('');
    let closed = false;
    const close = function() {
      if (closed) return;
      closed = true;
      menu.remove();
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', onKey, true);
    };
    const outside = function(event) { if (!menu.contains(event.target) && !button.contains(event.target)) close(); };
    const onKey = function(event) { if (event.key === 'Escape') { event.preventDefault(); close(); button.focus(); } };
    menu.querySelectorAll('[data-pdf-sort]').forEach(function(choice) {
      choice.addEventListener('click', function() {
        window.PP5ScorePdfSort = choice.getAttribute('data-pdf-sort');
        close();
        button.dataset.pdfSortChosen = '1';
        button.click();
      });
    });
    document.body.appendChild(menu);
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);
    menu.querySelector(`[data-pdf-sort="${current}"]`)?.focus();
  };
  if (!frame.__pp5PdfSortInstalled) {
    frame.__pp5PdfSortInstalled = true;
    frame.addEventListener('click', function(event) {
      const button = event.target.closest?.(PDF_SORT_BUTTONS);
      if (!button || button.disabled) return;
      if (button.dataset.pdfSortChosen === '1') { delete button.dataset.pdfSortChosen; return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      openPdfSortMenu_(button);
    }, true);
  }

  // ── ชื่องานของช่องคะแนนครั้งที่ 1-4 และ 6-9 (เช่น ใบงาน, สอบย่อย) ──
  // ป้ายชื่อใต้เลขลำดับแสดงตลอด คลิกเพื่อแก้ ชื่อเก็บใน currentData.termX.roundLabels และบน
  // table[data-round-labels] ซึ่ง gas-bridge อ่านตอนกดบันทึก (เก็บคู่กับ fullScores ของภาคเรียนนั้น)
  const ROUND_LABEL_PRESETS = ['ใบงาน', 'แบบฝึกหัด', 'สอบย่อย', 'ชิ้นงาน', 'การบ้าน', 'โครงงาน', 'ปฏิบัติ', 'สังเกตพฤติกรรม', 'นำเสนอ'];
  const ROUND_HEADER_INDEXES = [0, 1, 2, 3, null, 5, 6, 7, 8, null];

  const ensureRoundLabelStyles_ = function() {
    if (document.getElementById('pp5RoundLabelStyles')) return;
    const style = document.createElement('style');
    style.id = 'pp5RoundLabelStyles';
    style.textContent = [
      '.score-round-label{display:block;width:100%;max-width:92px;margin:3px auto 0;padding:1px 6px;border-radius:999px;border:1px solid rgba(15,23,42,.14);background:rgba(255,255,255,.85);color:#1e293b;font-size:.7rem;font-weight:600;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}',
      '.score-round-label:hover,.score-round-label:focus-visible{border-color:var(--primary);color:color-mix(in srgb, var(--primary) 85%, #000);outline:none}',
      '.score-round-label.is-empty{border-style:dashed;background:transparent;color:#64748b;font-weight:500}',
      '#pp5RoundLabelEditor{position:fixed;width:280px;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 10px 25px -5px rgba(15,23,42,.2);z-index:10070;font-family:Sarabun,sans-serif;padding:12px}',
      '#pp5RoundLabelEditor .rl-title{font-weight:700;font-size:13px;color:#1e293b;margin-bottom:8px}',
      '#pp5RoundLabelEditor .rl-presets{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 10px}',
      '#pp5RoundLabelEditor .rl-preset{border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:2px 9px;font-size:12px;color:#334155;cursor:pointer}',
      '#pp5RoundLabelEditor .rl-preset:hover{border-color:var(--primary);color:color-mix(in srgb, var(--primary) 85%, #000);background:color-mix(in srgb, var(--primary-light) 9%, #fff)}',
      '#pp5RoundLabelEditor .rl-hint{font-size:11px;color:#64748b;margin-top:8px}'
    ].join('\n');
    document.head.appendChild(style);
  };

  const termDataFor_ = function(container) {
    const key = container.id === 'scoreEntryTerm2Container' ? 'term2' : 'term1';
    return window.ScoreEntrySystem?.getCurrentData?.()?.[key] || null;
  };

  const currentRoundLabels_ = function(container) {
    const term = termDataFor_(container);
    const labels = Array.isArray(term?.roundLabels) ? term.roundLabels : [];
    return Array.from({ length: 9 }, (_item, index) => String(labels[index] || ''));
  };

  const paintRoundLabel_ = function(chip, label, index) {
    chip.textContent = label || '+ ชื่องาน';
    chip.classList.toggle('is-empty', !label);
    chip.title = label ? `ครั้งที่ ${index + 1}: ${label} (คลิกเพื่อแก้ไข)` : `ตั้งชื่องานของครั้งที่ ${index + 1} เช่น ใบงาน, สอบย่อย`;
  };

  const setRoundLabel_ = function(container, table, index, label) {
    const term = termDataFor_(container);
    const labels = currentRoundLabels_(container);
    labels[index] = label;
    if (term) term.roundLabels = labels;
    table.setAttribute('data-round-labels', JSON.stringify(labels));
    const chip = table.querySelector(`.score-round-label[data-round-index="${index}"]`);
    if (chip) paintRoundLabel_(chip, label, index);
    system.markDirty?.(container.id === 'scoreEntryTerm2Container' ? 'term2' : 'term1');
  };

  const openRoundLabelEditor_ = function(container, table, chip, index) {
    document.getElementById('pp5RoundLabelEditor')?.remove();
    const editor = document.createElement('div');
    editor.id = 'pp5RoundLabelEditor';
    const rect = chip.getBoundingClientRect();
    editor.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 240)}px`;
    editor.style.left = `${Math.max(10, Math.min(rect.left - 100, window.innerWidth - 290))}px`;
    editor.innerHTML = '<div class="rl-title"></div>'
      + '<input type="text" class="form-control form-control-sm" maxlength="30" placeholder="เช่น ใบงานที่ 1, สอบย่อยบทที่ 2">'
      + '<div class="rl-presets"></div>'
      + '<div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-primary flex-grow-1 rl-apply">ตกลง</button>'
      + '<button type="button" class="btn btn-sm btn-outline-secondary rl-clear">ล้างชื่อ</button></div>'
      + '<div class="rl-hint"><i class="bi bi-info-circle me-1"></i>ชื่องานจะถูกเก็บเมื่อกดปุ่ม "บันทึก" ของภาคเรียนนี้</div>';
    editor.querySelector('.rl-title').textContent = `ชื่องาน ครั้งที่ ${index + 1}`;
    const input = editor.querySelector('input');
    input.value = currentRoundLabels_(container)[index];
    ROUND_LABEL_PRESETS.forEach(function(preset) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rl-preset';
      button.textContent = preset;
      button.addEventListener('click', function() { input.value = preset; input.focus(); });
      editor.querySelector('.rl-presets').appendChild(button);
    });

    let closed = false;
    const close = function() {
      if (closed) return;
      closed = true;
      editor.remove();
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', onKey, true);
    };
    const apply = function(value) {
      const label = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 30);
      const changed = label !== currentRoundLabels_(container)[index];
      setRoundLabel_(container, table, index, label);
      close();
      chip.focus();
      if (changed) showScoreToast_(`${label ? `ตั้งชื่อครั้งที่ ${index + 1} เป็น "${escapeHtml_(label)}"` : `ล้างชื่อครั้งที่ ${index + 1}`} แล้ว — กดบันทึกเพื่อเก็บ`, 'success');
    };
    const outside = function(event) { if (!editor.contains(event.target) && event.target !== chip) close(); };
    const onKey = function(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); chip.focus(); }
      else if (event.key === 'Enter' && editor.contains(event.target) && event.target.tagName === 'INPUT') { event.preventDefault(); apply(input.value); }
    };
    editor.querySelector('.rl-apply').addEventListener('click', function() { apply(input.value); });
    editor.querySelector('.rl-clear').addEventListener('click', function() { apply(''); });
    document.body.appendChild(editor);
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);
    input.focus();
    input.select();
  };

  const installScoreRoundLabels_ = function(container) {
    const table = container?.querySelector('table.score-entry-table');
    const headerRow = table?.querySelectorAll('thead tr')[1];
    if (!headerRow || headerRow.querySelector('.score-round-label')) return;
    ensureRoundLabelStyles_();
    const labels = currentRoundLabels_(container);
    table.setAttribute('data-round-labels', JSON.stringify(labels));
    headerRow.querySelectorAll('th').forEach(function(th, position) {
      const index = ROUND_HEADER_INDEXES[position];
      if (index === null || index === undefined) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'score-round-label';
      chip.setAttribute('data-round-index', String(index));
      paintRoundLabel_(chip, labels[index], index);
      chip.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        openRoundLabelEditor_(container, table, chip, index);
      });
      th.appendChild(chip);
    });
  };

  ['scoreEntryTerm1Container', 'scoreEntryTerm2Container'].forEach(function(containerId) {
    const container = frame.querySelector(`#${containerId}`);
    if (!container || container.dataset.supabaseScoreStats === 'ready') return;
    container.dataset.supabaseScoreStats = 'ready';
    installScoreColumnAutofill_(container);
    installScoreRoundLabels_(container);
    if (!container.dataset.supabaseAutofillObserver) {
      container.dataset.supabaseAutofillObserver = 'ready';
      const observer = new MutationObserver(function() {
        installScoreColumnAutofill_(container);
        installScoreRoundLabels_(container);
      });
      observer.observe(container, { childList: true, subtree: true });
    }

    // ── 1. Real-Time Stats, Guard & Auto-Save ──
    container.addEventListener('input', function(e) {
      const tabId = containerId === 'scoreEntryTerm2Container' ? 'scoreEntryTerm2Tab' : 'scoreEntryTerm1Tab';
      setTimeout(() => updateStats(tabId), 260);

      const input = e.target;
      if (input && (input.classList.contains('score-entry-input') || input.classList.contains('score-entry-final-input'))) {
        const val = parseFloat(input.value);
        if (val > 100 || val < 0) {
          input.classList.add('score-input-invalid');
          input.title = 'คะแนนต้องอยู่ระหว่าง 0 - 100';
        } else {
          input.classList.remove('score-input-invalid');
          input.removeAttribute('title');
        }
      }
    });

    // ── 2. Excel-Style Keyboard Navigation ──
    container.addEventListener('keydown', function(e) {
      const input = e.target;
      if (!input || (!input.classList.contains('score-entry-input') && !input.classList.contains('score-entry-final-input'))) {
        return;
      }

      const currentRow = input.closest('tr');
      if (!currentRow) return;

      const currentIdx = input.getAttribute('data-index');
      const allRowInputs = Array.from(currentRow.querySelectorAll('.score-entry-input, .score-entry-final-input'));
      const colPos = allRowInputs.indexOf(input);

      // Enter หรือ ArrowDown -> เลื่อนลงไปยังนักเรียนแถวถัดไปในคอลัมน์เดียวกัน
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextRow = currentRow.nextElementSibling;
        if (nextRow) {
          const nextInputs = Array.from(nextRow.querySelectorAll('.score-entry-input, .score-entry-final-input'));
          const target = (currentIdx !== null ? nextRow.querySelector(`[data-index="${currentIdx}"]`) : null) || nextInputs[colPos];
          if (target) {
            target.focus();
            target.select();
          }
        }
      }
      // ArrowUp -> เลื่อนขึ้นไปยังนักเรียนแถวก่อนหน้าในคอลัมน์เดียวกัน
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevRow = currentRow.previousElementSibling;
        if (prevRow) {
          const prevInputs = Array.from(prevRow.querySelectorAll('.score-entry-input, .score-entry-final-input'));
          const target = (currentIdx !== null ? prevRow.querySelector(`[data-index="${currentIdx}"]`) : null) || prevInputs[colPos];
          if (target) {
            target.focus();
            target.select();
          }
        }
      }
      // ArrowRight -> เลื่อนไปช่องคะแนนถัดไปในแถวเดียวกัน
      else if (e.key === 'ArrowRight' && (input.selectionStart === input.value.length)) {
        if (colPos < allRowInputs.length - 1) {
          e.preventDefault();
          allRowInputs[colPos + 1].focus();
          allRowInputs[colPos + 1].select();
        }
      }
      // ArrowLeft -> เลื่อนไปช่องคะแนนก่อนหน้าในแถวเดียวกัน
      else if (e.key === 'ArrowLeft' && (input.selectionStart === 0)) {
        if (colPos > 0) {
          e.preventDefault();
          allRowInputs[colPos - 1].focus();
          allRowInputs[colPos - 1].select();
        }
      }
    });
  });


  const showPdfStatus = function(message, type) {
    const status = frame.querySelector('#scoreEntryStatusMessage');
    if (!status) return;
    status.className = `alert alert-${type || 'info'} mb-3`;
    status.textContent = message;
    status.classList.remove('d-none');
  };
  const pdfUrlFromBase64 = function(base64) {
    const clean = String(base64 || '').replace(/\s/g, '');
    if (!clean) throw new Error('ไม่ได้รับข้อมูล PDF จากระบบ');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  };
  const selectedScoreSubject = function() {
    const value = frame.querySelector('#scoreEntrySubjectSelect')?.value;
    if (!value) throw new Error('กรุณาเลือกรายวิชา');
    try { return JSON.parse(value); } catch (_error) { throw new Error('ข้อมูลรายวิชาไม่ถูกต้อง'); }
  };
  const showScorePdfPreview = function(url, label, filename) {
    document.getElementById('pp5ScorePdfPreview')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'pp5ScorePdfPreview';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10050;background:#eef2f7;display:flex;flex-direction:column;font-family:Sarabun,sans-serif';
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border-bottom:1px solid #cbd5e1;box-shadow:0 2px 8px rgba(15,23,42,.12)';
    const title = document.createElement('strong');
    title.textContent = `ตัวอย่าง PDF ${label}`;
    title.style.cssText = 'flex:1;color:#0f172a;font-size:16px';
    const download = document.createElement('a');
    download.href = url;
    download.download = filename;
    download.className = 'btn btn-success btn-sm';
    download.innerHTML = '<i class="bi bi-download"></i> ดาวน์โหลด PDF';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-outline-secondary btn-sm';
    close.innerHTML = '<i class="bi bi-x-lg"></i> ปิด';
    close.addEventListener('click', () => overlay.remove());
    const viewer = document.createElement('iframe');
    viewer.title = `ตัวอย่าง PDF ${label}`;
    viewer.src = url;
    viewer.style.cssText = 'width:100%;flex:1;border:0;background:#525659';
    toolbar.append(title, download, close);
    overlay.append(toolbar, viewer);
    document.body.appendChild(overlay);
  };
  const bindPdfPreview = function(buttonId, mode) {
    const button = frame.querySelector(`#${buttonId}`);
    if (!button || button.dataset.supabasePdfPreview === 'ready') return;
    button.dataset.supabasePdfPreview = 'ready';
    button.addEventListener('click', async function(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const originalDisabled = button.disabled;
      button.disabled = true;
      try {
        const grade = frame.querySelector('#scoreEntryGradeSelect')?.value;
        const classNo = frame.querySelector('#scoreEntryClassSelect')?.value;
        if (!grade || !classNo) throw new Error('กรุณาเลือกชั้นและห้อง');
        const subject = selectedScoreSubject();
        showPdfStatus('กำลังสร้างเอกสาร PDF กรุณารอสักครู่...', 'info');
        const base64 = mode === 'year'
          ? await window.GasServer.exportScoresPdf_Year(subject.name, subject.code, grade, classNo)
          : await window.GasServer.exportScoresPdf_SingleTerm(subject.name, subject.code, grade, classNo, mode);
        const url = pdfUrlFromBase64(base64);
        const label = mode === 'year' ? 'รวม 2 ภาคเรียน' : mode === 'term2' ? 'ภาคเรียนที่ 2' : 'ภาคเรียนที่ 1';
        const filename = `${subject.name || subject.code}_${grade}-${classNo}_${label}.pdf`.replaceAll(' ', '_');
        showScorePdfPreview(url, label, filename);
        window.__pp5ScorePdfUrls ||= [];
        window.__pp5ScorePdfUrls.push(url);
        while (window.__pp5ScorePdfUrls.length > 3) URL.revokeObjectURL(window.__pp5ScorePdfUrls.shift());
        showPdfStatus(`สร้าง PDF ${label} สำเร็จ`, 'success');
      } catch (error) {
        showPdfStatus(`ไม่สามารถสร้าง PDF ได้: ${error.message || error}`, 'danger');
      } finally {
        button.disabled = originalDisabled;
      }
    }, true);
  };
  bindPdfPreview('scoreEntryBtnExportTerm1Pdf', 'term1');
  bindPdfPreview('scoreEntryBtnExportTerm2Pdf', 'term2');
  bindPdfPreview('scoreEntryBtnExportYearPdf', 'year');

  // ── Subject Selection Watchdog & Quick Subject Bar ──
  const enhanceScoreEntrySubjectControls_ = function() {
    const gradeSelect = frame.querySelector('#scoreEntryGradeSelect');
    const classSelect = frame.querySelector('#scoreEntryClassSelect');
    const subjectSelect = frame.querySelector('#scoreEntrySubjectSelect');
    if (!gradeSelect || !classSelect || !subjectSelect) return;

    if (!document.getElementById('scoreSubjectBarStyles')) {
      const style = document.createElement('style');
      style.id = 'scoreSubjectBarStyles';
      style.textContent = `
        .score-subject-quick-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          margin: 6px 0 10px;
          padding: 4px 0;
        }
        .score-subj-quick-label {
          font-size: .84rem;
          font-weight: 700;
          color: var(--primary);
          margin-right: 2px;
          display: inline-flex;
          align-items: center;
        }
        .score-subj-btn {
          position: relative;
          border-radius: 999px !important;
          padding: .35rem .78rem !important;
          font-size: .84rem !important;
          font-weight: 600 !important;
          line-height: 1.2 !important;
          border: 1px solid #cbd5e1 !important;
          background: #ffffff !important;
          color: #334155 !important;
          cursor: pointer;
          transition: all .16s ease;
          box-shadow: 0 1px 3px rgba(15,23,42,.05);
        }
        .score-subj-btn:hover {
          border-color: color-mix(in srgb, var(--primary-light) 70%, #fff) !important;
          background: color-mix(in srgb, var(--primary-light) 9%, #fff) !important;
          color: color-mix(in srgb, var(--primary) 70%, #000) !important;
          transform: translateY(-1px);
        }
        .score-subj-btn.is-active,
        .score-subj-btn.btn-primary {
          border-color: transparent !important;
          background: linear-gradient(135deg, var(--primary) 0%, #2563eb 100%) !important;
          color: #ffffff !important;
          font-weight: 700 !important;
          box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 28%, transparent) !important;
        }
        .score-subj-btn .sn-mini { display: none; }
        @media (max-width: 576px) {
          /* มือถือ: ตาราง 3 คอลัมน์ ปุ่มเท่ากัน ชื่อวิชาแบบย่อ (ชื่อเต็มอยู่ใน title) */
          .score-subject-quick-bar { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
          .score-subj-quick-label { grid-column: 1 / -1; }
          .score-subj-btn { width: 100%; min-width: 0; min-height: 40px; padding: .4rem .3rem !important; font-size: .84rem !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .score-subj-btn .sn-full { display: none; }
          .score-subj-btn .sn-mini { display: inline; }
          /* ปุ่มชั้น/ปุ่มวิชาขึ้นแล้ว = ช่องเลือกชั้นและวิชาซ้ำกัน ซ่อนไว้ เหลือช่องห้อง (ปุ่มชั้นมีแค่ห้อง 1) */
          .score-entry-compact-header:has(#gcQuickBar) #scoreEntryGradeSelect,
          .score-entry-compact-header:has(#scoreSubjectQuickBar .score-subj-btn) #scoreEntrySubjectSelect { display: none !important; }
          .score-entry-compact-header:has(#gcQuickBar) #scoreEntryClassSelect { max-width: 50%; }
        }
      `;
      document.head.appendChild(style);
    }

    const updateQuickBarActive = function() {
      const activeIdx = subjectSelect.selectedIndex;
      frame.querySelectorAll('.score-subj-btn').forEach(btn => {
        const isCur = Number(btn.dataset.subjectIndex) === activeIdx;
        btn.classList.toggle('is-active', isCur);
        btn.classList.toggle('btn-primary', isCur);
        btn.classList.toggle('btn-outline-secondary', !isCur);
      });
    };

    const renderSubjectQuickBar = function() {
      if (subjectSelect.options.length <= 1) return;
      let bar = frame.querySelector('#scoreSubjectQuickBar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'scoreSubjectQuickBar';
        bar.className = 'score-subject-quick-bar';
        const gcBar = frame.querySelector('#gcQuickBar');
        if (gcBar && gcBar.parentElement) {
          gcBar.parentElement.insertBefore(bar, gcBar.nextSibling);
        } else {
          const header = frame.querySelector('.score-entry-compact-header') ||
                         gradeSelect.closest('.score-entry-controls-row') ||
                         gradeSelect.parentElement;
          if (header) header.insertBefore(bar, header.firstChild);
        }
      }
      bar.innerHTML = '';

      const label = document.createElement('span');
      label.className = 'score-subj-quick-label';
      label.innerHTML = '<i class="bi bi-journal-bookmark me-1"></i>วิชา:';
      bar.appendChild(label);

      for (let i = 1; i < subjectSelect.options.length; i++) {
        const opt = subjectSelect.options[i];
        let subjObj = null;
        try { subjObj = JSON.parse(opt.value); } catch(_) {}
        const rawName = subjObj?.name || opt.textContent.split('(')[0].trim();
        const code = subjObj?.code || '';

        let shortName = rawName
          .replace('และเทคโนโลยี', '')
          .replace('ศาสนา และวัฒนธรรม', '')
          .replace('และพลศึกษา', '')
          .replace('อาชีพ', '')
          .replace('การทุจริต', '')
          .trim();

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm score-subj-btn' + (subjectSelect.selectedIndex === i ? ' is-active btn-primary' : ' btn-outline-secondary');
        // มือถือแสดงชื่อย่อ (คณิตฯ, วิทยฯ ...) ให้พอดีปุ่มในตาราง 3 คอลัมน์ จอใหญ่แสดงชื่อเดิม
        const miniName = shortName
          .replace(/^ภาษาอังกฤษ$/, 'อังกฤษ')
          .replace(/^คณิตศาสตร์$/, 'คณิตฯ')
          .replace(/^วิทยาศาสตร์$/, 'วิทยฯ')
          .replace(/^สังคมศึกษา$/, 'สังคมฯ')
          .replace(/^ประวัติศาสตร์$/, 'ประวัติฯ')
          .replace(/^หน้าที่พลเมือง$/, 'หน้าที่ฯ')
          .replace(/^การป้องกัน$/, 'ป้องกันฯ');
        const fullSpan = document.createElement('span');
        fullSpan.className = 'sn-full';
        fullSpan.textContent = shortName;
        const miniSpan = document.createElement('span');
        miniSpan.className = 'sn-mini';
        miniSpan.textContent = miniName;
        btn.append(fullSpan, miniSpan);
        btn.title = `${rawName} (${code})`;
        btn.dataset.subjectIndex = String(i);
        btn.dataset.subjectCode = code;

        btn.addEventListener('click', function(e) {
          e.preventDefault();
          subjectSelect.disabled = false;
          subjectSelect.selectedIndex = i;
          subjectSelect.dispatchEvent(new Event('change', { bubbles: true }));
          try {
            if (code) localStorage.setItem('pp5_selected_subject_code', code);
          } catch(_) {}
          updateQuickBarActive();
        });
        bar.appendChild(btn);
      }
      updateQuickBarActive();
    };

    const unlockSubjectDropdown = function() {
      const grade = gradeSelect.value;
      const classNo = classSelect.value;
      if (grade && classNo && subjectSelect.options.length > 1) {
        if (subjectSelect.disabled) {
          subjectSelect.disabled = false;
        }
        renderSubjectQuickBar();
      }
    };

    const restoreSavedSubject = function() {
      const savedCode = localStorage.getItem('pp5_selected_subject_code');
      if (savedCode && subjectSelect.options.length > 1) {
        for (let i = 1; i < subjectSelect.options.length; i++) {
          try {
            const parsed = JSON.parse(subjectSelect.options[i].value);
            if (parsed.code === savedCode || parsed.id === savedCode) {
              if (subjectSelect.selectedIndex !== i) {
                subjectSelect.selectedIndex = i;
                subjectSelect.dispatchEvent(new Event('change', { bubbles: true }));
              }
              break;
            }
          } catch(_) {}
        }
      }
    };

    // Watchdog on subjectSelect disabled property and options changes
    const observer = new MutationObserver(function() {
      unlockSubjectDropdown();
      updateQuickBarActive();
    });
    observer.observe(subjectSelect, { attributes: true, attributeFilter: ['disabled'], childList: true });

    // Hook system.updateControls
    const originalUpdateControls = system.updateControls;
    if (typeof originalUpdateControls === 'function' && !system.__pp5UpdateControlsPatched) {
      system.__pp5UpdateControlsPatched = true;
      system.updateControls = function() {
        originalUpdateControls.apply(system, arguments);
        unlockSubjectDropdown();
      };
    }

    subjectSelect.addEventListener('change', function() {
      try {
        const val = JSON.parse(subjectSelect.value);
        if (val.code || val.id) localStorage.setItem('pp5_selected_subject_code', val.code || val.id);
      } catch(_) {}
      unlockSubjectDropdown();
      updateQuickBarActive();
    });

    [50, 150, 300, 600, 1000, 1800].forEach(function(delay) {
      setTimeout(function() {
        unlockSubjectDropdown();
        restoreSavedSubject();
      }, delay);
    });

    gradeSelect.addEventListener('change', function() {
      setTimeout(function() {
        unlockSubjectDropdown();
        restoreSavedSubject();
      }, 350);
    });
    classSelect.addEventListener('change', function() {
      setTimeout(function() {
        unlockSubjectDropdown();
        restoreSavedSubject();
      }, 100);
    });
  };
  enhanceScoreEntrySubjectControls_();

  // มาจากปุ่ม "เปิดวิชานี้" ในการ์ดตรวจคะแนน: ชั้น/ห้อง/วิชาถูกเลือกด้วยค่าที่จำไว้แล้ว เหลือสลับไปภาคเรียน 2
  // เมื่อโหลดคะแนนวิชานั้นเสร็จ (รอได้ราว 15 วินาที)
  (function openDashboardScoreTarget_() {
    let target = null;
    try {
      target = JSON.parse(sessionStorage.getItem('pp5DashboardScoreTarget') || 'null');
      sessionStorage.removeItem('pp5DashboardScoreTarget');
    } catch (_) { return; }
    if (!target || Number(target.semester) !== 2) return;
    let tries = 0;
    const timer = setInterval(function() {
      const loaded = frame.querySelector('#scoreEntryTerm2Container table');
      const tab = frame.querySelector('#scoreEntryTerm2Tab');
      if ((loaded && tab) || ++tries > 60) {
        clearInterval(timer);
        if (loaded && tab && !tab.classList.contains('active')) tab.click();
      }
    }, 250);
  })();

  setTimeout(function() {
    const activeTab = frame.querySelector('#scoreEntryTabs .nav-link.active')?.id || 'scoreEntryTerm1Tab';
    if (activeTab === 'scoreEntryCombinedTab') system.renderCombined('scoreEntryCombinedContainer');
    else updateStats(activeTab);
  }, 400);
}

function enhanceSupabaseStudentScoresSummaryPage_() {
  const frame = document.getElementById('contentFrame');
  const button = frame?.querySelector('#exportPDFBtn');
  if (!frame || !button || button.dataset.supabasePdfPreview === 'ready') return;
  button.dataset.supabasePdfPreview = 'ready';
  button.removeAttribute('onclick');

  const pdfUrl = function(result) {
    if (typeof result === 'string' && result.trim()) return result;
    const value = result?.blobUrl || result?.dataUri || result?.viewUrl || result?.downloadUrl || result?.url;
    if (typeof value === 'string' && value.trim()) return value;
    throw new Error('ไม่ได้รับไฟล์ PDF จากระบบ');
  };
  const showStatus = function(type, title, message) {
    if (typeof window.showInfo === 'function') {
      window.showInfo(type, title, message);
      return;
    }
    const banner = frame.querySelector('#infoBanner');
    if (!banner) return;
    banner.className = `info-banner ${type || 'info'}`;
    banner.style.display = 'block';
    const titleElement = banner.querySelector('#infoTitle');
    const textElement = banner.querySelector('#infoText');
    if (titleElement) titleElement.textContent = title;
    if (textElement) textElement.textContent = message;
  };
  const showPreview = function(url, filename) {
    document.getElementById('pp5ClassScoresPdfPreview')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'pp5ClassScoresPdfPreview';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10050;background:#eef2f7;display:flex;flex-direction:column;font-family:Sarabun,sans-serif';
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border-bottom:1px solid #cbd5e1;box-shadow:0 2px 8px rgba(15,23,42,.12)';
    const title = document.createElement('strong');
    title.textContent = 'ตัวอย่าง PDF สรุปผลการเรียนรายชั้น';
    title.style.cssText = 'flex:1;color:#0f172a;font-size:16px';
    const download = document.createElement('a');
    download.href = url;
    download.download = filename;
    download.className = 'btn btn-success btn-sm';
    download.innerHTML = '<i class="bi bi-download"></i> ดาวน์โหลด PDF';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-outline-secondary btn-sm';
    close.innerHTML = '<i class="bi bi-x-lg"></i> ปิด';
    close.addEventListener('click', () => overlay.remove());
    const viewer = document.createElement('iframe');
    viewer.title = 'ตัวอย่าง PDF สรุปผลการเรียนรายชั้น';
    viewer.src = url;
    viewer.style.cssText = 'width:100%;flex:1;border:0;background:#525659';
    toolbar.append(title, download, close);
    overlay.append(toolbar, viewer);
    document.body.appendChild(overlay);
  };

  button.addEventListener('click', async function(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> กำลังสร้าง PDF...';
    try {
      // PDF ต้องเป็นชั้น/ห้อง/ภาคเดียวกับตารางที่แสดงอยู่ (appData.currentData ของหน้า) ไม่ใช่ค่าที่เพิ่งเปลี่ยนในช่องเลือก
      const shown = window.appData?.currentData?.success ? window.appData.currentData : null;
      if (!shown && window.appData && 'currentData' in window.appData) throw new Error('กรุณารอให้ตารางโหลดเสร็จก่อน');
      const grade = shown?.grade || frame.querySelector('#gradeSelect')?.value;
      const classNo = shown?.classNo || frame.querySelector('#classSelect')?.value;
      if (!grade || !classNo) throw new Error('กรุณาเลือกชั้นและห้องก่อน');
      showStatus('info', 'กำลังสร้าง PDF', 'กรุณารอสักครู่ ระบบกำลังจัดหน้าตารางสรุปผลการเรียน');
      const term = shown?.term || frame.querySelector('#termSelect')?.value || 'year';
      // Same order as the table on screen: เลขที่ / รหัสนักเรียน / ชาย → หญิง.
      const sortMode = frame.querySelector('.score-sort-btn.active')?.getAttribute('data-sort') || 'no';
      const result = await window.GasServer.exportStudentScoresPDF(grade, classNo, term, sortMode);
      const url = pdfUrl(result);
      const termSuffix = term === '1' || term === '2' ? `_ภาค${term}` : '';
      const filename = `สรุปผลการเรียนรายชั้น_${grade}-${classNo}${termSuffix}.pdf`.replaceAll(' ', '_');
      showPreview(url, filename);
      showStatus('success', 'สร้าง PDF สำเร็จ', 'เปิดตัวอย่างแล้ว สามารถกดดาวน์โหลด PDF จากแถบด้านบนได้ทันที');
    } catch (error) {
      showStatus('error', 'ไม่สามารถสร้าง PDF ได้', error.message || String(error));
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }, true);
}
// Supabase-only guard for configured school holidays. The legacy page still
// renders its familiar warning, while this layer prevents a misleading
// "saved" result and keeps the original GAS source untouched.
async function enhanceSupabaseAttendanceDailyPage_() {
  const frame = document.getElementById('contentFrame');
  const dateInput = frame?.querySelector('#attendanceDate');
  if (!frame || !dateInput || !window.GasServer?.getSpecialHolidays) return;
  // "แจ้งผู้ปกครองนักเรียนที่ขาดวันนี้ทาง LINE" (js/line-notify.js), hidden until LINE is configured.
  window.PP5Line?.enhanceAttendanceDaily?.(frame)?.catch?.(() => {});

  // Dashboard room tiles carry an explicit class target. This enhancer runs once right after the
  // page HTML is inserted (before the page's own script binds its change listeners and before
  // GradeClassHelper fills the room options) and again after the scripts: owner 2026-10-08 saw
  // ป.3/1 selected but an empty list because the first run used the target up too early. So wait
  // until the page is ready (forceReloadStudents exists, the room option is there and enabled),
  // set grade/room/date, then load the list directly.
  try {
    const target = JSON.parse(sessionStorage.getItem('pp5DashboardAttendanceTarget') || 'null');
    if (target && target.grade && target.room && !window.__pp5AttendanceTargetPending) {
      window.__pp5AttendanceTargetPending = true;
      // A forceReloadStudents left from an earlier visit to this page is not "ready": the page
      // scripts of THIS visit redefine it after binding their listeners.
      const staleReload = window.forceReloadStudents;
      let tries = 0;
      const timer = setInterval(() => {
        const page = document.getElementById('contentFrame');
        const gradeSelect = page?.querySelector('#gradeSelect');
        const classSelect = page?.querySelector('#classSelect');
        const date = page?.querySelector('#attendanceDate');
        const room = String(target.room);
        const hasGrade = gradeSelect && [...gradeSelect.options].some((o) => o.value === target.grade);
        const fresh = typeof window.forceReloadStudents === 'function' && window.forceReloadStudents !== staleReload;
        // The page's start-up (a moment after its script) fills today's date; before that the page
        // skips any load, so an empty date means "not ready yet".
        const ready = fresh && hasGrade && date && /^\d{4}-\d{2}-\d{2}$/.test(date.value)
          && classSelect && !classSelect.disabled && [...classSelect.options].some((o) => o.value === room);
        if (!ready && gradeSelect && hasGrade && gradeSelect.value !== target.grade && fresh) {
          // Page ready but another grade selected: switch grade so GradeClassHelper loads its rooms.
          gradeSelect.value = target.grade;
          gradeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (!ready && ++tries < 80) return;
        clearInterval(timer);
        window.__pp5AttendanceTargetPending = false;
        sessionStorage.removeItem('pp5DashboardAttendanceTarget');
        if (!ready) return;
        gradeSelect.value = target.grade;
        classSelect.value = room;
        if (target.day && /^\d{4}-\d{2}-\d{2}$/.test(target.day) && date.value !== target.day) {
          date.value = target.day;
          date.dispatchEvent(new Event('change', { bubbles: true })); // redraws the Thai date
        }
        // Safety net: loadDailyStudents sets AttendanceState.lastLoadedKey ("grade-room-date")
        // synchronously when a load really starts (and clears it when done), so check right after
        // asking and ask again shortly if it did not start (up to 6 times).
        let attempts = 0;
        const startLoad = () => {
          window.forceReloadStudents();
          if (window.AttendanceState?.lastLoadedKey === target.grade + '-' + room + '-' + date.value) return;
          if (++attempts < 6) setTimeout(startLoad, 400);
        };
        startLoad();
      }, 150);
    }
  } catch (_) { window.__pp5AttendanceTargetPending = false; }

  try {
    window.__pp5AttendanceHolidayLookup = await window.GasServer.getSpecialHolidays();
  } catch (error) {
    console.error('อ่านวันหยุดสำหรับหน้าเช็กชื่อรายวันไม่สำเร็จ:', error.message);
    return;
  }

  const syncHolidayGuard = function() {
    const holidayName = window.__pp5AttendanceHolidayLookup?.[dateInput.value] || '';
    const saveButtons = [
      frame.querySelector('#btnSaveAttendanceTop'),
      frame.querySelector('#btnSaveAttendanceSticky')
    ].filter(Boolean);

    saveButtons.forEach(function(button) {
      if (holidayName) {
        button.disabled = true;
        button.dataset.pp5HolidayDisabled = '1';
        button.title = `ไม่บันทึกเวลาเรียน: ${holidayName}`;
      } else if (button.dataset.pp5HolidayDisabled === '1') {
        button.disabled = false;
        delete button.dataset.pp5HolidayDisabled;
        button.removeAttribute('title');
      }
    });

    let note = frame.querySelector('#pp5HolidaySaveGuardNote');
    if (holidayName) {
      if (!note) {
        note = document.createElement('div');
        note.id = 'pp5HolidaySaveGuardNote';
        note.style.cssText = 'margin-top:6px;font-weight:700;color:#b91c1c';
        frame.querySelector('#holidayWarningContainer')?.appendChild(note);
      }
      if (note) note.textContent = `ระบบปิดการบันทึกวันนี้อัตโนมัติ (${holidayName})`;
    } else if (note) {
      note.remove();
    }
  };

  if (dateInput.dataset.pp5HolidayGuardBound !== '1') {
    dateInput.dataset.pp5HolidayGuardBound = '1';
    dateInput.addEventListener('change', function() {
      setTimeout(syncHolidayGuard, 0);
    });
  }

  if (typeof window.saveDailyAttendance === 'function' && !window.saveDailyAttendance.__pp5HolidayGuarded) {
    const originalSaveDailyAttendance = window.saveDailyAttendance;
    const guardedSaveDailyAttendance = async function() {
      const selectedDate = document.getElementById('attendanceDate')?.value || '';
      const holidayName = window.__pp5AttendanceHolidayLookup?.[selectedDate] || '';
      if (holidayName) {
        const message = `วันที่เลือกเป็นวันหยุด (${holidayName}) ระบบไม่ได้บันทึกเวลาเรียน`;
        if (typeof window.showStatusMessage === 'function') window.showStatusMessage('❌ ' + message, 'error');
        else window.alert(message);
        syncHolidayGuard();
        return { success: false, blocked: true, message };
      }
      return originalSaveDailyAttendance.apply(this, arguments);
    };
    guardedSaveDailyAttendance.__pp5HolidayGuarded = true;
    window.saveDailyAttendance = guardedSaveDailyAttendance;
  }

  syncHolidayGuard();
  setTimeout(syncHolidayGuard, 300);
  setTimeout(syncHolidayGuard, 1000);
}

// Add a top save shortcut while keeping the page's draggable floating save button.
function enhanceSupabaseAttendanceMonthlyPage_() {
  const frame = document.getElementById('contentFrame');
  if (!frame) return;

  const headerCard = frame.querySelector('.att-header-card');
  if (headerCard && !frame.querySelector('#btnSaveAttendanceMonthlyTop')) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'att-header-actions ms-auto d-flex align-items-center gap-2';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.id = 'btnSaveAttendanceMonthlyTop';
    saveBtn.className = 'btn btn-success btn-save-monthly-top';
    saveBtn.title = 'บันทึกข้อมูลการเช็คชื่อ';
    saveBtn.innerHTML = '<i class="bi bi-floppy-fill me-1"></i> <span>บันทึกข้อมูล</span>';
    saveBtn.addEventListener('click', function() {
      if (window.AttendanceMonthly && typeof window.AttendanceMonthly.saveMonthlyAttendanceClient === 'function') {
        window.AttendanceMonthly.saveMonthlyAttendanceClient();
      }
    });

    actionsDiv.appendChild(saveBtn);
    headerCard.appendChild(actionsDiv);
  }

  // ตารางรายเดือน (31 ช่อง) ใส่จอมือถือให้สบายไม่ได้: บนจอแคบแนะนำหน้าเช็คชื่อรายวันแทน (ปิดได้ จำไว้ในแท็บนี้)
  let monthlyHintClosed = false;
  try { monthlyHintClosed = sessionStorage.getItem('pp5MonthlyPhoneHintClosed') === '1'; } catch (_) {}
  const isPhone = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 576px)').matches;
  if (headerCard && isPhone && !monthlyHintClosed && !frame.querySelector('#pp5MonthlyPhoneHint')) {
    const hint = document.createElement('div');
    hint.id = 'pp5MonthlyPhoneHint';
    hint.className = 'pp5-phone-hint';
    hint.innerHTML = '<i class="bi bi-phone" aria-hidden="true"></i>'
      + '<span>บนมือถือ เช็คชื่อที่หน้า <b>เช็คชื่อรายวัน</b> จะง่ายกว่า (กดทีละคนได้เลย)</span>'
      + '<button type="button" class="pp5-phone-hint-go">ไปเช็คชื่อรายวัน</button>'
      + '<button type="button" class="pp5-phone-hint-x" aria-label="ปิดคำแนะนำ">&times;</button>';
    hint.querySelector('.pp5-phone-hint-go').addEventListener('click', function() {
      if (typeof window.navigateTo === 'function') window.navigateTo('attendance_daily');
    });
    hint.querySelector('.pp5-phone-hint-x').addEventListener('click', function() {
      try { sessionStorage.setItem('pp5MonthlyPhoneHintClosed', '1'); } catch (_) {}
      hint.remove();
    });
    headerCard.insertAdjacentElement('afterend', hint);
  }

  // Keep the top shortcut in sync with the loaded roster.
  if (window.AttendanceMonthly && !window.AttendanceMonthly.__pp5TopSaveEnhanced) {
    window.AttendanceMonthly.__pp5TopSaveEnhanced = true;
    const originalRenderTable = window.AttendanceMonthly.renderTable;
    if (typeof originalRenderTable === 'function') {
      window.AttendanceMonthly.renderTable = function(students) {
        const result = originalRenderTable.apply(this, arguments);
        const topBtn = document.getElementById('btnSaveAttendanceMonthlyTop');
        if (topBtn) {
          topBtn.disabled = !(students && students.length > 0);
        }
        return result;
      };
    }
  }
}

// Subject import: the legacy page only accepts .csv. An Excel file is converted in the browser to
// the same CSV layout (first sheet, anchored at A1 so the two header rows stay where the importer
// expects them) and handed back to the page's own handleCSVImport, so validation and the import
// itself stay exactly as they were.
function subjectWorkbookToCsv_(XLSX, bytes) {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const sheetName = workbook.SheetNames && workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet || !sheet['!ref']) throw new Error('ไฟล์ Excel ไม่มีข้อมูลในแผ่นงานแรก');
  const range = XLSX.utils.decode_range(sheet['!ref']);
  range.s.r = 0;
  range.s.c = 0;
  sheet['!ref'] = XLSX.utils.encode_range(range);
  return XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n', rawNumbers: true });
}

function enhanceSupabaseSubjectManagerPage_() {
  window.PP5SchoolReadiness?.enhanceSubjects();
  const input = document.getElementById('csvFileInput');
  if (!input) return;
  input.setAttribute('accept', '.csv,.xlsx,.xls');
  input.dataset.pp5SubjectWorkbook = '1';
  const button = [...document.querySelectorAll('#contentFrame button')]
    .find((item) => (item.getAttribute('onclick') || '').includes('csvFileInput'));
  if (button) {
    const label = button.querySelector('.subject-action-full');
    if (label) label.textContent = '📥 นำเข้า CSV/Excel';
    else button.textContent = '📥 นำเข้า CSV/Excel';
  }
  if (window.__pp5SubjectWorkbookListener) return;
  window.__pp5SubjectWorkbookListener = true;
  // Capture phase on document runs before the input's own onchange, so an Excel file never
  // reaches the legacy ".csv only" check; a CSV file passes straight through untouched.
  document.addEventListener('change', async (event) => {
    const target = event.target;
    if (!target || !target.dataset || target.dataset.pp5SubjectWorkbook !== '1') return;
    const file = target.files && target.files[0];
    if (!file || !/\.xlsx?$/i.test(file.name)) return;
    event.stopPropagation();
    try {
      if (!window.XLSX?.read) throw new Error('ไม่สามารถเปิดไฟล์ Excel ได้ กรุณาตรวจการเชื่อมต่อแล้วโหลดหน้าเว็บใหม่');
      const csv = subjectWorkbookToCsv_(window.XLSX, new Uint8Array(await file.arrayBuffer()));
      const transfer = new DataTransfer();
      transfer.items.add(new File([csv], file.name.replace(/\.xlsx?$/i, '.csv'), { type: 'text/csv' }));
      target.files = transfer.files;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) {
      target.value = '';
      const message = '❌ อ่านไฟล์ Excel ไม่สำเร็จ: ' + (error?.message || error);
      if (typeof window.showToast === 'function') window.showToast(message, false);
      else console.error(message);
    }
  }, true);
}

// Supabase-only safety panel for DMC import history and guarded rollback.
// The original GAS page/UX remains unchanged; this panel is appended only in
// the Supabase web application and is visible to administrators.
function enhanceSupabaseDmcImportPage_() {
  if ((localStorage.getItem('role') || '') !== 'admin') return;
  const fileInput = document.getElementById('csvFileInput');
  const frame = document.getElementById('contentFrame');
  if (!fileInput || !frame) return;

  let panel = document.getElementById('pp5DmcImportHistory');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'pp5DmcImportHistory';
    panel.className = 'card border-0 shadow-sm mt-4 mb-4';
    panel.innerHTML = `
      <div class="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2 py-3">
        <div>
          <h5 class="mb-1"><i class="bi bi-shield-check text-success me-2"></i>จุดย้อนกลับก่อนนำเข้า DMC</h5>
          <div class="small text-muted">ระบบเก็บ snapshot ก่อนแก้ข้อมูล และจะไม่ยอมย้อนกลับหากมีข้อมูลใหม่ต่อเนื่อง</div>
        </div>
        <button type="button" class="btn btn-outline-primary btn-sm" id="pp5RefreshDmcHistory">
          <i class="bi bi-arrow-clockwise me-1"></i>รีเฟรชประวัติ
        </button>
      </div>
      <div class="card-body">
        <div id="pp5DmcHistoryStatus" class="small text-muted mb-2" aria-live="polite">กำลังอ่านประวัติ...</div>
        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>วันที่นำเข้า</th><th>ปี</th><th>ไฟล์</th><th class="text-center">ข้อมูล</th><th>สถานะ</th><th class="text-end">การจัดการ</th>
              </tr>
            </thead>
            <tbody id="pp5DmcHistoryRows"></tbody>
          </table>
        </div>
      </div>`;
    frame.appendChild(panel);
  }

  const refreshButton = document.getElementById('pp5RefreshDmcHistory');
  if (refreshButton && !refreshButton.__pp5Bound) {
    refreshButton.addEventListener('click', () => window.refreshDmcImportHistory?.());
    refreshButton.__pp5Bound = true;
  }

  window.refreshDmcImportHistory = function() {
    const status = document.getElementById('pp5DmcHistoryStatus');
    const body = document.getElementById('pp5DmcHistoryRows');
    if (!status || !body) return;
    status.className = 'small text-muted mb-2';
    status.textContent = 'กำลังอ่านประวัติ...';
    google.script.run
      .withSuccessHandler(function(rows) {
        const history = Array.isArray(rows) ? rows : [];
        if (!history.length) {
          body.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">ยังไม่มีการนำเข้า DMC หลังติดตั้งระบบนี้</td></tr>';
          status.textContent = 'ข้อมูลนักเรียนปัจจุบันยังไม่ถูกเปลี่ยนแปลงจากหน้าจอนี้';
          return;
        }
        body.innerHTML = history.map(function(item) {
          const created = item.createdAt ? new Date(item.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
          const statusBadge = item.status === 'rolled_back'
            ? '<span class="badge bg-secondary">ย้อนกลับแล้ว</span>'
            : '<span class="badge bg-success">นำเข้าแล้ว</span>';
          const rollbackAction = item.rollbackAvailable
            ? '<button type="button" class="btn btn-outline-danger btn-sm pp5-dmc-rollback" data-import-id="' + escapeHtml_(item.importId) + '"><i class="bi bi-arrow-counterclockwise me-1"></i>ตรวจและย้อนกลับ</button>'
            : '<span class="small text-muted" title="' + escapeHtml_(item.rollbackReason || '') + '">' + escapeHtml_(item.rollbackReason || 'ย้อนกลับไม่ได้') + '</span>';
          return '<tr>' +
            '<td class="text-nowrap">' + escapeHtml_(created) + '</td>' +
            '<td>' + escapeHtml_(item.academicYear) + '</td>' +
            '<td><div class="text-truncate" style="max-width:220px" title="' + escapeHtml_(item.fileName || '') + '">' + escapeHtml_(item.fileName || '-') + '</div></td>' +
            '<td class="text-center text-nowrap">' + Number(item.validCount || 0) + ' คน<br><small class="text-muted">เพิ่ม ' + Number(item.insertedCount || 0) + ' / อัปเดต ' + Number(item.updatedCount || 0) + '</small></td>' +
            '<td>' + statusBadge + '<br><small class="text-muted">snapshot ' + Number(item.snapshotCount || 0) + '</small></td>' +
            '<td class="text-end">' + rollbackAction + '</td>' +
          '</tr>';
        }).join('');
        body.querySelectorAll('.pp5-dmc-rollback').forEach(function(button) {
          button.addEventListener('click', function() {
            window.rollbackDmcImportFromHistory?.(button.dataset.importId, button);
          });
        });
        status.textContent = 'พบประวัติ ' + history.length + ' รายการ — ระบบอนุญาตให้ย้อนกลับเฉพาะรายการล่าสุดที่ปลอดภัย';
      })
      .withFailureHandler(function(error) {
        body.innerHTML = '';
        status.className = 'small text-danger mb-2';
        status.textContent = 'อ่านประวัติไม่สำเร็จ: ' + (error?.message || error || 'ไม่ทราบสาเหตุ');
      })
      .getDmcImportHistory(10);
  };

  window.rollbackDmcImportFromHistory = function(importId, button) {
    if (!importId || button?.disabled) return;
    const status = document.getElementById('pp5DmcHistoryStatus');
    if (button) button.disabled = true;
    if (status) {
      status.className = 'small text-primary mb-2';
      status.textContent = 'กำลังตรวจเงื่อนไขความปลอดภัย...';
    }
    google.script.run
      .withSuccessHandler(function(result) {
        if (result?.cancelled) {
          if (status) status.textContent = result.message;
        } else if (status) {
          status.className = 'small text-success mb-2';
          status.textContent = result?.message || 'ย้อนกลับเรียบร้อยแล้ว';
        }
        window.refreshDmcImportHistory?.();
      })
      .withFailureHandler(function(error) {
        if (button) button.disabled = false;
        if (status) {
          status.className = 'small text-danger mb-2';
          status.textContent = 'ไม่สามารถย้อนกลับได้: ' + (error?.message || error || 'ไม่ทราบสาเหตุ');
        }
      })
      .rollbackDmcStudentImport(importId);
  };

  const importStatus = document.getElementById('importStatus');
  if (importStatus && !importStatus.__pp5HistoryObserver) {
    const observer = new MutationObserver(function() {
      if (/นำเข้า DMC สำเร็จ/.test(importStatus.textContent || '')) window.refreshDmcImportHistory?.();
    });
    observer.observe(importStatus, { childList: true, subtree: true, characterData: true });
    importStatus.__pp5HistoryObserver = observer;
  }

  window.refreshDmcImportHistory();
}

// Adds an admin-only, one-time migration control without changing the legacy
// Apps Script page. The actual write still requires the protected Edge Function.
function enhanceSupabaseAdminUsersPage_() {
  if ((localStorage.getItem('role') || '') !== 'admin') return;
  enhanceSupabaseBulkResetParents_();
  const frame = document.getElementById('contentFrame');
  const refreshButton = frame?.querySelector('#refreshBtn');
  const actions = refreshButton?.parentElement;
  if (!frame || !actions || frame.querySelector('#pp5ImportLegacyUsers')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'pp5ImportLegacyUsers';
  button.className = 'btn btn-warning';
  button.hidden = true;
  actions.insertBefore(button, refreshButton);
  // One-time move of the old Apps Script accounts: shown only while staged accounts are still waiting.
  // A new school has no staging table (the installer leaves it out) and never sees this button.
  (async () => {
    try {
      const { count, error } = await window.PP5Data.client.from('legacy_user_import_staging')
        .select('*', { count: 'exact', head: true }).is('imported_at', null);
      if (error || !(count > 0)) { button.remove(); return; }
      button.innerHTML = '<span>📥 นำเข้าผู้ใช้เดิม ' + count + ' บัญชี</span>';
      button.hidden = false;
    } catch (_) { button.remove(); }
  })();

  const showStatus = function(message, ok) {
    const status = frame.querySelector('#status');
    if (!status) return;
    status.className = 'mt-4 ' + (ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800');
    status.textContent = message;
    status.classList.remove('hidden');
  };

  const escapeCsv = function(value) {
    const source = String(value == null ? '' : value);
    return /[",\r\n]/.test(source) ? '"' + source.replace(/"/g, '""') + '"' : source;
  };

  const downloadCredentials = function(credentials) {
    if (!credentials.length) return;
    const rows = [['ชื่อผู้ใช้', 'รหัสผ่านชั่วคราว', 'สิทธิ์', 'ชื่อ-นามสกุล']]
      .concat(credentials.map((item) => [item.username, item.temporaryPassword, item.role, item.displayName]));
    const csv = '\uFEFF' + rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'PP5_รหัสผ่านชั่วคราว_ผู้ใช้เดิม_2569.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  button.addEventListener('click', async function() {
    const confirmed = window.confirm(
      'ระบบจะสร้างบัญชี Supabase ที่ยังไม่มี โดยคงชื่อผู้ใช้ สิทธิ์ และการผูกนักเรียนเดิม\n\n' +
      'บัญชีใหม่จะได้รับรหัสผ่านชั่วคราวแบบสุ่มและดาวน์โหลดเป็น CSV เพียงครั้งเดียว ต้องเก็บไฟล์นี้เป็นความลับ\n\nดำเนินการต่อหรือไม่?'
    );
    if (!confirmed) return;

    const original = button.innerHTML;
    button.disabled = true;
    const credentials = [];
    let created = 0;
    let matched = 0;
    let remaining = 1;

    try {
      for (let round = 0; remaining > 0 && round < 10; round += 1) {
        button.innerHTML = '<span>⏳ กำลังนำเข้า ชุดที่ ' + (round + 1) + '...</span>';
        const result = await window.GasServer.importLegacyUsersAdmin(15);
        created += Number(result.created || 0);
        matched += Number(result.matched || 0);
        credentials.push(...(result.credentials || []));
        remaining = Number(result.remaining || 0);
        if ((result.failures || []).length) {
          const first = result.failures[0];
          throw new Error('นำเข้าไม่ครบ: ' + first.username + ' — ' + first.message);
        }
      }
      if (remaining > 0) throw new Error('ระบบหยุดเพื่อความปลอดภัย ยังเหลือ ' + remaining + ' บัญชี กรุณากดนำเข้าอีกครั้ง');
      downloadCredentials(credentials);
      showStatus('นำเข้าผู้ใช้เดิมสำเร็จ: สร้างใหม่ ' + created + ' บัญชี / เชื่อมบัญชีเดิม ' + matched + ' บัญชี', true);
      window.AdminPanel?.reload?.();
      window.alert(
        'นำเข้าผู้ใช้เดิมสำเร็จ\nสร้างใหม่ ' + created + ' บัญชี\nเชื่อมบัญชีเดิม ' + matched + ' บัญชี\n\n' +
        (credentials.length ? 'ดาวน์โหลดไฟล์รหัสผ่านชั่วคราวแล้ว กรุณาเก็บเป็นความลับและให้ผู้ใช้เปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ' : 'ไม่มีบัญชีใหม่ จึงไม่มีไฟล์รหัสผ่านชั่วคราว')
      );
    } catch (error) {
      if (credentials.length) downloadCredentials(credentials);
      showStatus(
        'นำเข้าไม่สำเร็จ: ' + (error?.message || error) +
        (credentials.length ? ' — ดาวน์โหลดรหัสผ่านของบัญชีที่สร้างสำเร็จแล้ว ' + credentials.length + ' บัญชีเรียบร้อย' : ''),
        false
      );
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  });
}

function enhanceSupabaseBulkResetParents_() {
  const frame = document.getElementById('contentFrame');
  const refreshButton = frame?.querySelector('#refreshBtn');
  const actions = refreshButton?.parentElement;
  if (!frame || !actions || frame.querySelector('#pp5ResetAllParentPasswords')) return;
  document.getElementById('pp5ResetAllParentPasswordsModal')?.remove();

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'pp5ResetAllParentPasswords';
  button.className = 'btn btn-warning';
  button.textContent = '🔑 ตั้งรหัสผู้ปกครองทั้งหมด';
  actions.insertBefore(button, refreshButton);

  const modal = document.createElement('div');
  modal.id = 'pp5ResetAllParentPasswordsModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);align-items:center;justify-content:center;padding:20px;font-family:Sarabun,sans-serif';
  modal.innerHTML = `
    <section role="dialog" aria-modal="true" aria-labelledby="pp5ResetAllParentPasswordsTitle" style="width:min(100%,460px);padding:22px;border-radius:16px;background:#fff;box-shadow:0 20px 50px rgba(15,23,42,.25)">
      <h2 id="pp5ResetAllParentPasswordsTitle" style="margin:0 0 8px;font-size:20px">ตั้งรหัสผ่านบัญชีผู้ปกครองทั้งหมด</h2>
      <p style="margin:0 0 14px;color:#475569">ระบบจะเปลี่ยนรหัสของทุกบัญชีที่มีสิทธิ์ Parent โดยไม่เปลี่ยนบัญชีครูหรือผู้ดูแล</p>
      <label for="pp5ResetAllParentPasswordsInput" style="display:block;margin-bottom:6px;font-weight:600">รหัสผ่านใหม่ (อย่างน้อย 10 ตัวอักษร)</label>
      <input id="pp5ResetAllParentPasswordsInput" type="password" autocomplete="off" style="box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:9px;font:inherit">
      <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:18px">
        <button type="button" id="pp5ResetAllParentPasswordsCancel" class="btn">ยกเลิก</button>
        <button type="button" id="pp5ResetAllParentPasswordsSubmit" class="btn btn-warning">ตั้งรหัสทั้งหมด</button>
      </div>
      <p id="pp5ResetAllParentPasswordsProgress" role="status" style="display:none;margin:12px 0 0;color:#475569"></p>
    </section>`;
  frame.appendChild(modal);

  const input = modal.querySelector('#pp5ResetAllParentPasswordsInput');
  const cancel = modal.querySelector('#pp5ResetAllParentPasswordsCancel');
  const submit = modal.querySelector('#pp5ResetAllParentPasswordsSubmit');
  const progress = modal.querySelector('#pp5ResetAllParentPasswordsProgress');
  const closeModal = function() {
    modal.style.display = 'none';
    input.value = '';
    progress.style.display = 'none';
    progress.textContent = '';
    submit.disabled = false;
    cancel.disabled = false;
    submit.textContent = 'ตั้งรหัสทั้งหมด';
  };

  button.addEventListener('click', function() {
    modal.style.display = 'flex';
    input.focus();
  });
  cancel.addEventListener('click', closeModal);
  modal.addEventListener('click', function(event) {
    if (event.target === modal && !submit.disabled) closeModal();
  });
  submit.addEventListener('click', async function() {
    const password = String(input.value || '');
    if (password.length < 10) {
      window.alert('รหัสผ่านต้องมีความยาวอย่างน้อย 10 ตัวอักษร');
      input.focus();
      return;
    }
    if (!window.confirm('ยืนยันตั้งรหัสผ่านใหม่ให้บัญชี Parent ทุกบัญชีหรือไม่?')) return;

    submit.disabled = true;
    cancel.disabled = true;
    submit.textContent = 'กำลังดำเนินการ...';
    progress.style.display = 'block';
    progress.textContent = 'กำลังเปลี่ยนรหัสผ่านของบัญชีผู้ปกครอง';
    try {
      const result = await window.GasServer.resetAllParentPasswordsAdmin({ password, confirmAllParents: true });
      input.value = '';
      closeModal();
      const failed = Array.isArray(result.failures) ? result.failures : [];
      const message = failed.length
        ? `เปลี่ยนสำเร็จ ${result.updated}/${result.total} บัญชี; ไม่สำเร็จ ${failed.length} บัญชี: ${failed.map((item) => item.username).join(', ')}`
        : `เปลี่ยนรหัสผ่านสำเร็จ ${result.updated} บัญชีผู้ปกครอง`;
      const status = frame.querySelector('#status');
      if (status) {
        status.className = 'mt-4 ' + (failed.length ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800');
        status.textContent = message;
        status.classList.remove('hidden');
      }
      window.AdminPanel?.reload?.();
      window.alert(message);
    } catch (error) {
      progress.style.display = 'block';
      progress.textContent = 'เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + (error?.message || error);
      submit.disabled = false;
      cancel.disabled = false;
      submit.textContent = 'ลองอีกครั้ง';
      input.value = '';
    }
  });
}

// Adds selectable output columns to the Supabase student-list export page.
// The embedded legacy page remains untouched and still owns filtering/status UX.
function enhanceSupabaseStudentExportPage_() {
  const form = document.getElementById('exportForm');
  if (!form) return;
  let panel = document.getElementById('pp5StudentExportColumns');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'pp5StudentExportColumns';
    panel.style.cssText = 'margin:0 0 24px;padding:18px;border:1px solid #ddd6fe;border-radius:14px;background:#faf9ff;font-family:Sarabun,sans-serif';
    panel.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:13px">
        <div>
          <div style="font-size:14px;font-weight:700;color:color-mix(in srgb, var(--primary) 55%, #000)">📑 เลือกข้อมูลที่ต้องการในรายงาน</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px">ใช้กับทั้ง PDF และ Excel - PDF จะปรับแนวกระดาษให้อัตโนมัติ</div>
        </div>
        <div id="pp5StudentExportOrientation" style="font-size:12px;font-weight:700;color:color-mix(in srgb, var(--primary) 85%, #000);background:color-mix(in srgb, var(--primary-light) 9%, #fff);border-radius:999px;padding:5px 10px">PDF แนวตั้ง</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px 12px" id="pp5StudentExportChecks">
        <label class="pp5-export-choice"><input type="checkbox" data-export-column="order"> ลำดับ</label>
        <label class="pp5-export-choice"><input type="checkbox" data-export-column="studentNumber" checked> เลขที่</label>
        <label class="pp5-export-choice"><input type="checkbox" data-export-column="fullName" checked> ชื่อ-นามสกุล</label>
        <label class="pp5-export-choice"><input type="checkbox" data-export-column="studentId" checked> รหัสนักเรียน</label>
        <label class="pp5-export-choice"><input type="checkbox" data-export-column="nationalId"> เลขบัตรประชาชน</label>
        <label class="pp5-export-choice"><input type="checkbox" data-export-column="birthDate"> วันเดือนปีเกิด</label>
        <label class="pp5-export-choice"><input type="checkbox" data-export-column="grade"> ระดับชั้น</label>
        <label class="pp5-export-choice"><input type="checkbox" data-export-column="room"> ห้อง</label>
        <label class="pp5-export-choice"><input type="checkbox" data-export-column="gender"> เพศ</label>
        <label class="pp5-export-choice" style="border-color:#a7f3d0;background:#f0fdf4"><input type="checkbox" id="pp5StudentExportScoreSlots"> ช่องบันทึกคะแนน 10 ช่อง</label>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button type="button" class="pp5-export-preset" data-export-preset="basic">ข้อมูลพื้นฐาน</button>
        <button type="button" class="pp5-export-preset" data-export-preset="registry">ข้อมูลทะเบียนเต็ม</button>
        <button type="button" class="pp5-export-preset" data-export-preset="scores">แบบบันทึกคะแนน 10 ช่อง</button>
      </div>
      <div id="pp5StudentExportSummary" style="font-size:12px;color:#4b5563;margin-top:11px" aria-live="polite"></div>
      <style>
        #pp5StudentExportColumns .pp5-export-choice{display:flex;align-items:center;gap:7px;min-height:38px;padding:7px 9px;border:1px solid #e5e7eb;border-radius:9px;background:#fff;color:#374151;font-size:13px;cursor:pointer}
        #pp5StudentExportColumns .pp5-export-choice:has(input:checked){border-color:#a78bfa;background:#f5f3ff;color:#5b21b6;font-weight:700}
        #pp5StudentExportColumns input[type=checkbox]{width:16px;height:16px;accent-color:#7c3aed}
        #pp5StudentExportColumns .pp5-export-preset{border:1px solid #c4b5fd;border-radius:8px;background:#fff;color:#6d28d9;padding:6px 11px;font:600 12px Sarabun,sans-serif;cursor:pointer}
        #pp5StudentExportColumns .pp5-export-preset:hover{background:#ede9fe}
      </style>`;
    const divider = form.querySelector('.divider');
    if (divider) divider.insertAdjacentElement('beforebegin', panel);
    else form.insertAdjacentElement('afterbegin', panel);
  }

  const columnInputs = [...panel.querySelectorAll('[data-export-column]')];
  const scoreInput = panel.querySelector('#pp5StudentExportScoreSlots');
  const orientation = panel.querySelector('#pp5StudentExportOrientation');
  const summary = panel.querySelector('#pp5StudentExportSummary');
  const labelMap = {
    order: 'ลำดับ', studentNumber: 'เลขที่', fullName: 'ชื่อ-นามสกุล',
    studentId: 'รหัสนักเรียน', nationalId: 'เลขบัตรประชาชน', birthDate: 'วันเดือนปีเกิด',
    grade: 'ระดับชั้น', room: 'ห้อง', gender: 'เพศ'
  };
  const syncSelection = function() {
    let columns = columnInputs.filter((input) => input.checked).map((input) => input.dataset.exportColumn);
    if (!columns.length) {
      const nameInput = columnInputs.find((input) => input.dataset.exportColumn === 'fullName');
      if (nameInput) nameInput.checked = true;
      columns = ['fullName'];
    }
    const scoreSlots = scoreInput?.checked === true;
    window.PP5StudentExportOptions = { columns, scoreSlots };
    const landscape = scoreSlots || columns.length > 6;
    if (orientation) orientation.textContent = landscape ? 'PDF แนวนอน' : 'PDF แนวตั้ง';
    if (summary) {
      summary.textContent = 'คอลัมน์: ' + columns.map((key) => labelMap[key] || key).join(', ') +
        (scoreSlots ? ' และช่องคะแนน 1-10' : '');
    }
  };
  const applyPreset = function(name) {
    const presets = {
      basic: { columns: ['studentNumber', 'fullName', 'studentId'], scores: false },
      registry: { columns: ['studentNumber', 'fullName', 'studentId', 'nationalId', 'birthDate', 'grade', 'room', 'gender'], scores: false },
      scores: { columns: ['studentNumber', 'fullName', 'studentId'], scores: true }
    };
    const preset = presets[name] || presets.basic;
    columnInputs.forEach((input) => { input.checked = preset.columns.includes(input.dataset.exportColumn); });
    if (scoreInput) scoreInput.checked = preset.scores;
    syncSelection();
  };

  if (!panel.__pp5Bound) {
    columnInputs.forEach((input) => input.addEventListener('change', syncSelection));
    scoreInput?.addEventListener('change', syncSelection);
    panel.querySelectorAll('[data-export-preset]').forEach((button) => {
      button.addEventListener('click', () => applyPreset(button.dataset.exportPreset));
    });
    form.addEventListener('submit', syncSelection, true);
    panel.__pp5Bound = true;
  }

  if (typeof window.resetForm === 'function' && !window.resetForm.__pp5ColumnsWrapped) {
    const originalReset = window.resetForm;
    const wrappedReset = function() {
      originalReset.apply(this, arguments);
      applyPreset('basic');
    };
    wrappedReset.__pp5ColumnsWrapped = true;
    window.resetForm = wrappedReset;
  }
  syncSelection();
}

// The legacy page initializes twice. Keep the remembered grade/class selected
// after the second async grade load so the visible controls and loaded roster agree.
function enhanceSupabaseScoreSheetPage_() {
  const gradeSelect = document.getElementById('gradeSelect');
  const classSelect = document.getElementById('classSelect');
  if (!gradeSelect || !classSelect) return;

  const restoreSelection = function(preferredGrade, preferredClassNo) {
    const saved = window.GradeClassHelper?.loadSelection?.() || {};
    const grade = preferredGrade || saved.grade || '';
    const classNo = preferredClassNo || saved.classNo || '1';
    if (!grade || !Array.from(gradeSelect.options).some((option) => option.value === grade)) return;
    if (window.GradeClassHelper?.selectGradeClass) {
      window.GradeClassHelper.selectGradeClass(gradeSelect, classSelect, grade, classNo);
    } else {
      gradeSelect.value = grade;
      gradeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  if (gradeSelect.dataset.pp5ScoreSheetEnhanced !== '1') {
    gradeSelect.dataset.pp5ScoreSheetEnhanced = '1';
    const originalPopulateGradeSelect = window.populateGradeSelect;
    if (typeof originalPopulateGradeSelect === 'function') {
      window.populateGradeSelect = function(grades) {
        const previousGrade = gradeSelect.value;
        const previousClassNo = classSelect.value;
        originalPopulateGradeSelect.apply(this, arguments);
        setTimeout(() => restoreSelection(previousGrade, previousClassNo), 0);
      };
    }
  }

  setTimeout(() => {
    if (!gradeSelect.value) restoreSelection('', '');
  }, 1600);
}


// Makes repeated growth measurements fast without changing the read-only
// legacy page: focus selects the previous value, and Enter advances through
// weight/height fields so teachers can type replacements without deleting.
function enhanceSupabaseStudentGrowthEntryPage_() {
  const frame = document.getElementById('contentFrame');
  if (!frame || frame.dataset.pp5GrowthQuickEntry === '1') return;
  frame.dataset.pp5GrowthQuickEntry = '1';

  const fieldSelector = '#sgRows input.sg-w, #sgRows input.sg-h';
  const selectWholeValue = function(input) {
    setTimeout(() => {
      if (document.activeElement === input && typeof input.select === 'function') input.select();
    }, 0);
  };

  frame.addEventListener('focusin', (event) => {
    if (event.target.matches?.(fieldSelector)) selectWholeValue(event.target);
  });

  frame.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !event.target.matches?.(fieldSelector)) return;
    event.preventDefault();
    const fields = [...frame.querySelectorAll(fieldSelector)].filter((field) => !field.disabled);
    const currentIndex = fields.indexOf(event.target);
    const nextField = fields[currentIndex + (event.shiftKey ? -1 : 1)];
    if (nextField) {
      nextField.focus();
      selectWholeValue(nextField);
    }
  });

  const count = frame.querySelector('#sgCount');
  if (count?.parentElement && !frame.querySelector('#pp5GrowthQuickEntryHint')) {
    const hint = document.createElement('div');
    hint.id = 'pp5GrowthQuickEntryHint';
    hint.className = 'growth-muted';
    hint.style.marginTop = '4px';
    hint.textContent = '⚡ กรอกเร็ว: คลิกช่องแล้วพิมพ์ค่าใหม่ได้ทันที ระบบจะแทนค่าเดิมให้อัตโนมัติ และกด Enter เพื่อไปช่องถัดไป';
    count.parentElement.appendChild(hint);
  }
}

// เพิ่มเฉพาะหน้าเว็บ Supabase โดยคง HTML/UX ต้นฉบับจาก Apps Script ไว้เหมือนเดิม
function enhanceSupabaseSettingsPage_() {
  const supervisor = document.getElementById('supervisorName');
  if (!supervisor) return;

  // เพิ่มแท็บ "สำรองข้อมูล" ในหน้าตั้งค่าระบบกลาง (js/data-backup.js, admin เท่านั้น)
  // แท็บ "หน้าตาโรงเรียน" (ธีมสี คำขวัญ สโลแกน) ก่อนแท็บสำรองข้อมูล (js/school-branding.js, admin เท่านั้น)
  try { window.PP5SchoolBranding?.enhanceSettingsPage?.(); } catch (err) { console.warn('branding settings tab failed', err); }
  try { window.PP5Backup?.enhanceSettingsPage?.(); } catch (err) { console.warn('backup settings tab failed', err); }

  if (!document.getElementById('pp5SupabaseExtraSettings')) {
    const extra = document.createElement('div');
    extra.id = 'pp5SupabaseExtraSettings';
    extra.className = 'setting-grid-2';
    extra.innerHTML = `
      <div>
        <label for="affiliation" class="form-label">สังกัด</label>
        <input id="affiliation" type="text" class="form-control" placeholder="เช่น สพป.ชื่อจังหวัด เขต 1">
        <div class="field-help">ใช้ในหัวเอกสารและรายงานทางราชการ</div>
      </div>
      <div>
        <label for="schoolPhone" class="form-label">เบอร์โทรศัพท์โรงเรียน</label>
        <input id="schoolPhone" type="text" class="form-control" inputmode="tel" placeholder="ไม่บังคับ">
        <div class="field-help">ข้อมูลติดต่อสำหรับเอกสารที่รองรับ</div>
      </div>
      <div style="grid-column: 1 / -1;">
        <label for="footerNote" class="form-label">หมายเหตุท้ายเอกสาร</label>
        <input id="footerNote" type="text" class="form-control" placeholder="เว้นว่างได้">
        <div class="field-help">จะแสดงเฉพาะรายงานที่มีพื้นที่หมายเหตุรองรับ</div>
      </div>`;
    supervisor.parentElement.insertAdjacentElement('afterend', extra);
  }
  // ระดับชั้นที่เปิดสอน (js/grade-levels.js, admin เท่านั้น) ป.1–ป.6 หรือ ป.1–ม.3
  try { window.PP5Grades?.enhanceSettingsPage?.(); } catch (err) { console.warn('grade levels setting failed', err); }

  // สวิตช์ลายน้ำ "ผลระหว่างปี" อยู่บนสุดของแท็บ "การพิมพ์ & PDF" (เดิมอยู่ท้ายแท็บข้อมูลทั่วไป ครูหาไม่เจอ)
  // บันทึกทันทีลง settings_json.interim_watermark ไม่ต้องกดบันทึกตั้งค่า
  if (!document.getElementById('pp5InterimWatermarkBox')) {
    const printIntro = document.querySelector('#printingTabPane .card-body .section-intro');
    const box = document.createElement('div');
    box.id = 'pp5InterimWatermarkBox';
    box.style.cssText = 'border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.08);border-radius:12px;padding:12px 14px;';
    box.innerHTML = `
      <div class="form-check form-switch m-0">
        <input class="form-check-input" type="checkbox" role="switch" id="pp5InterimWatermark" checked disabled>
        <label class="form-check-label fw-semibold" for="pp5InterimWatermark">ใส่ลายน้ำบนเอกสารรายภาคเรียน (ภาคเรียนที่ 1 / 2)</label>
      </div>
      <div class="field-help">ใช้กับ ปพ.6 / รายงานหน้าเดียว / ใบคะแนนรายวิชา / สรุปผลประเมิน ที่พิมพ์แยกภาคเรียนที่ 1 หรือ 2 และแถบแจ้งในหน้าผู้ปกครอง (เอกสารรายปีไม่มีลายน้ำ) · กดสวิตช์แล้วบันทึกทันที <span id="pp5InterimWatermarkStatus"></span></div>
      <div class="mt-2" id="pp5InterimTextRow">
        <label class="form-label fw-semibold mb-1" for="pp5InterimWatermarkText">ข้อความลายน้ำ (พิมพ์เองได้ ไม่เกิน 60 ตัวอักษร เว้นว่าง = ข้อความเดิม)</label>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <input type="text" class="form-control" id="pp5InterimWatermarkText" maxlength="60" placeholder="ผลระหว่างปี — ตัดสินผลการเรียนเป็นรายปี" style="flex:1 1 280px;max-width:520px" disabled>
          <button type="button" class="btn btn-primary btn-sm" id="pp5InterimTextSave" disabled><i class="bi bi-check-lg"></i> บันทึกข้อความ</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="pp5InterimTextReset" disabled>ใช้ข้อความเดิม</button>
          <small class="text-muted" id="pp5InterimTextCount"></small>
        </div>
        <div class="field-help" id="pp5InterimTextStatus">ข้อความนี้ใช้ทั้งลายน้ำใน PDF และหัวแถบแจ้งในหน้าผู้ปกครอง</div>
      </div>`;
    if (printIntro) printIntro.insertAdjacentElement('afterend', box);
    else document.getElementById('pp5SupabaseExtraSettings')?.insertAdjacentElement('afterend', box);
    const interimSwitch = box.querySelector('#pp5InterimWatermark');
    const interimStatus = box.querySelector('#pp5InterimWatermarkStatus');
    const setInterimStatus = (message, tone) => {
      if (!interimStatus) return;
      interimStatus.textContent = message ? ' · ' + message : '';
      interimStatus.className = tone ? 'text-' + tone : '';
    };
    const interimText = box.querySelector('#pp5InterimWatermarkText');
    const interimTextSave = box.querySelector('#pp5InterimTextSave');
    const interimTextReset = box.querySelector('#pp5InterimTextReset');
    const interimTextStatus = box.querySelector('#pp5InterimTextStatus');
    const interimTextCount = box.querySelector('#pp5InterimTextCount');
    const countInterimText = () => { interimTextCount.textContent = interimText.value.length + '/60'; };
    const setInterimTextBusy = (busy) => { [interimText, interimTextSave, interimTextReset].forEach((el) => { el.disabled = busy; }); };
    window.PP5Data?.settings?.get?.().then((settings) => {
      interimSwitch.checked = settings?.interimWatermark !== false;
      interimSwitch.disabled = false;
      interimText.value = settings?.interimWatermarkText || '';
      countInterimText();
      setInterimTextBusy(false);
    }).catch(() => { interimSwitch.disabled = false; setInterimTextBusy(false); });
    interimText.addEventListener('input', countInterimText);
    const saveInterimText = async (value) => {
      setInterimTextBusy(true);
      interimTextStatus.textContent = 'กำลังบันทึก...';
      interimTextStatus.className = 'field-help text-muted';
      try {
        const saved = await window.PP5Data.settings.setInterimWatermarkText(value);
        interimText.value = saved;
        countInterimText();
        interimTextStatus.textContent = saved ? 'บันทึกแล้ว: ลายน้ำจะเป็น "' + saved + '"' : 'ใช้ข้อความเดิมแล้ว: "ผลระหว่างปี — ตัดสินผลการเรียนเป็นรายปี"';
        interimTextStatus.className = 'field-help text-success';
      } catch (error) {
        interimTextStatus.textContent = 'บันทึกไม่สำเร็จ: ' + (error?.message || error);
        interimTextStatus.className = 'field-help text-danger';
      } finally {
        setInterimTextBusy(false);
      }
    };
    interimTextSave.addEventListener('click', () => saveInterimText(interimText.value));
    interimTextReset.addEventListener('click', () => saveInterimText(''));
    interimText.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); saveInterimText(interimText.value); } });
    interimSwitch.addEventListener('change', async () => {
      const wanted = interimSwitch.checked;
      interimSwitch.disabled = true;
      setInterimStatus('กำลังบันทึก...', 'muted');
      try {
        await window.PP5Data.settings.setInterimWatermark(wanted);
        setInterimStatus(wanted ? 'เปิดลายน้ำแล้ว' : 'ปิดลายน้ำแล้ว', 'success');
      } catch (error) {
        interimSwitch.checked = !wanted;
        setInterimStatus('บันทึกไม่สำเร็จ: ' + (error?.message || error), 'danger');
      } finally {
        interimSwitch.disabled = false;
      }
    });
  }

  if (!document.getElementById('pp5JumpToSigBtn') && supervisor.parentElement) {
    const jumpBtn = document.createElement('div');
    jumpBtn.id = 'pp5JumpToSigBtn';
    jumpBtn.className = 'mt-2';
    jumpBtn.innerHTML = `
      <button type="button" class="btn btn-sm btn-outline-primary fw-bold" onclick="document.getElementById('pp5SignaturesManagerCard')?.scrollIntoView({behavior:'smooth',block:'start'});">
        <i class="bi bi-pen-fill me-1"></i>จัดการลายเซ็น ผอ. / วิชาการ / ครูประจำชั้นทุกห้อง (ปพ.5 & ปพ.6) ↓
      </button>
    `;
    supervisor.parentElement.appendChild(jumpBtn);
  }

  const logoLabel = document.querySelector('label[for="logoFileId"]');
  if (logoLabel) logoLabel.textContent = 'โลโก้โรงเรียน (URL หรือ Google Drive File ID)';
  const logoInput = document.getElementById('logoFileId');
  if (logoInput) logoInput.placeholder = 'วาง URL หรือ File ID ของรูปโลโก้';

  const folder = document.getElementById('pdfSaveFolderId');
  if (folder) {
    folder.value = '';
    folder.disabled = true;
    folder.placeholder = 'ดาวน์โหลด PDF ผ่านเบราว์เซอร์';
    const help = folder.parentElement?.querySelector('.field-help');
    if (help) help.textContent = 'เวอร์ชัน Supabase ดาวน์โหลด PDF ลงเครื่องโดยตรง การบันทึกอัตโนมัติจะเปิดใช้เมื่อเชื่อม Supabase Storage';
  }

  const yearInput = document.getElementById('newAcademicYear');
  const yearNotice = yearInput?.closest('.card-body')?.querySelector('.danger-soft');
  if (yearNotice) {
    yearNotice.textContent = 'ระบบจะสร้าง snapshot ใน Supabase เก็บทะเบียนนักเรียนและข้อมูลพื้นฐานของปีเดิม แล้วเตรียมปีใหม่ใน transaction เดียว ซึ่งสามารถตรวจสอบและย้อนกลับได้ก่อนเริ่มบันทึกข้อมูลปีใหม่';
  }

  const previewInfo = document.getElementById('previewInfo');
  if (previewInfo && !previewInfo.__pp5SupabasePreviewObserver) {
    const adaptPreviewCopy = () => {
      const original = previewInfo.innerHTML;
      const adapted = original
        .replace('📝 ชีตที่จะ Rename (เก็บข้อมูลเดิมไว้):', '📦 Snapshot ที่ระบบจะเก็บ: โรงเรียน นักเรียน ครูประจำชั้น รายวิชา และทะเบียนรายปี')
        .replace('✨ ชีตใหม่ที่จะสร้าง:', '🆕 ข้อมูลปีใหม่: ทะเบียนหลังเลื่อนชั้นและครูประจำชั้น')
        .replace('✅ ข้อมูลเดิมทั้งหมดจะยังคงอยู่ในชีตเดิม (แค่เปลี่ยนชื่อ)', '✅ ข้อมูลปีเดิมจะคงอยู่ในทะเบียนรายปีและตารางธุรกรรมเดิม โดยไม่เขียนทับ');
      if (adapted !== original) previewInfo.innerHTML = adapted;
    };
    const observer = new MutationObserver(adaptPreviewCopy);
    observer.observe(previewInfo, { childList: true, subtree: true, characterData: true });
    previewInfo.__pp5SupabasePreviewObserver = observer;
    adaptPreviewCopy();
  }

  const editor = window.SettingsEditor;
  if (editor && !editor.__pp5SupabaseSettingsWrapped) {
    const originalPopulateForm = editor.populateForm;
    editor.populateForm = function(settings) {
      originalPopulateForm.call(this, settings);
      const values = {
        affiliation: settings?.affiliation || settings?.['สังกัด'] || '',
        schoolPhone: settings?.schoolPhone || settings?.phone || settings?.school_phone || settings?.['เบอร์โทรศัพท์โรงเรียน'] || '',
        footerNote: settings?.footerNote || settings?.footer_note || settings?.['หมายเหตุท้ายเอกสาร'] || ''
      };
      Object.entries(values).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = value;
      });
      const pdfFolder = document.getElementById('pdfSaveFolderId');
      if (pdfFolder) {
        pdfFolder.value = '';
        pdfFolder.disabled = true;
      }
      const summary = document.getElementById('summaryPdfFolder');
      if (summary) summary.textContent = 'ดาวน์โหลดผ่านเบราว์เซอร์';
    };
    editor.__pp5SupabaseSettingsWrapped = true;
  }

  if (editor && !editor.__pp5SupabaseYearSwitchWrapped) {
    editor.__pp5OriginalDoSwitchYear = editor.doSwitchYear;
    editor.doSwitchYear = function() {
      const self = this;
      const newYear = self.$('newAcademicYear') ? self.$('newAcademicYear').value : '';
      if (!newYear) {
        self.setSwitchStatus('กรุณาระบุปีการศึกษาใหม่', 'warning');
        return;
      }
      const confirmation = '⚠️ ยืนยันเปลี่ยนปีการศึกษาเป็น ' + newYear + '?\n\nระบบจะดำเนินการใน Supabase transaction เดียว:\n1. สร้าง snapshot ข้อมูลโรงเรียน นักเรียน ครูประจำชั้น รายวิชา และทะเบียนรายปี\n2. คงข้อมูลเช็กชื่อ คะแนน และแบบประเมินของปีเดิมไว้\n3. เลื่อนชั้นนักเรียนที่ยังเรียนต่อ\n4. จำหน่ายนักเรียนชั้น ป.6/ม.3\n5. สร้างทะเบียนและคัดลอกครูประจำชั้นสำหรับปีใหม่\n6. เปลี่ยนปีการศึกษาและเริ่มภาคเรียนที่ 1\n\nหากขั้นตอนใดผิดพลาด ระบบจะยกเลิกทั้งรายการโดยอัตโนมัติ';
      if (!confirm(confirmation)) return;

      const switchBtn = self.$('switchYearBtn');
      const originalHtml = switchBtn.innerHTML;
      switchBtn.disabled = true;
      switchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังเปลี่ยนปี...';
      self.setSwitchStatus('<span class="spinner-border spinner-border-sm me-2"></span>กำลังสร้าง snapshot และเปลี่ยนปีใน Supabase transaction...', 'info');

      google.script.run
        .withSuccessHandler(function(result) {
          switchBtn.innerHTML = originalHtml;
          if (!result || !result.success) {
            switchBtn.disabled = false;
            self.setSwitchStatus('เกิดข้อผิดพลาด: ' + (result && result.message || 'ไม่ทราบ'), 'danger');
            return;
          }
          let message = '<strong>✅ ' + result.message + '</strong><br>';
          message += '📦 Snapshot: ' + (result.snapshotId || result.transitionId || '-') + '<br>';
          message += '🎓 เลื่อนชั้น: ' + (result.studentsPromoted || 0) + ' คน | จำหน่าย ป.6/ม.3: ' + (result.studentsGraduated || 0) + ' คน';
          self.setSwitchStatus(message, 'success');
          setTimeout(function() { self.initializeSettingsPage(); }, 1000);
        })
        .withFailureHandler(function(err) {
          switchBtn.disabled = false;
          switchBtn.innerHTML = originalHtml;
          self.setSwitchStatus('เกิดข้อผิดพลาด: ' + (err && err.message || err), 'danger');
        })
        .switchAcademicYear(Number(newYear), {}, localStorage.getItem('authToken') || '');
    };
    const switchButton = document.getElementById('switchYearBtn');
    if (switchButton) switchButton.onclick = editor.doSwitchYear.bind(editor);
    editor.__pp5SupabaseYearSwitchWrapped = true;
  }
  enhanceAcademicYearTransitionV2_();
  enhanceSupabaseSignaturesManager_();
}

function enhanceAcademicYearTransitionV2_() {
  const switchBtn = document.getElementById('switchYearBtn');
  const yearCardBody = switchBtn?.closest('.card-body');
  if (!yearCardBody) return;

  if (document.getElementById('pp5TransitionV2Wizard')) return;

  const wizard = document.createElement('div');
  wizard.id = 'pp5TransitionV2Wizard';
  wizard.className = 'mt-4 pt-3 border-top';
  wizard.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <h5 class="fw-bold mb-1 text-primary">
          <i class="bi bi-mortarboard-fill me-2"></i>ระบบปิดปีการศึกษาและเลื่อนชั้น (Transition Wizard V2)
        </h5>
        <div class="text-muted small">
          ตรวจสอบรายชื่อนักเรียน กำหนดเด็กซ้ำชั้นรายบุคคล และยืนยันเลื่อนชั้นสู่ปีการศึกษาใหม่จริง
        </div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span id="v2DraftStatusBadge" class="badge bg-secondary px-3 py-2 fs-6">พร้อมเริ่มดำเนินการ</span>
        <button id="v2BtnCreateDraft" type="button" class="btn btn-primary btn-sm">
          <i class="bi bi-file-earmark-plus me-1"></i>เริ่มขั้นตอนเลื่อนชั้น (โหลดรายชื่อนักเรียน)
        </button>
      </div>
    </div>

    <div id="v2WizardBody" style="display:none;">
      <!-- 1. Stats Summary Cards -->
      <div class="row g-3 mb-3">
        <div class="col-6 col-md-3">
          <div class="card p-3 border-0 shadow-sm text-center" style="background:#f0f7ff;border-radius:12px;">
            <div class="text-muted small fw-bold">นักเรียนทั้งหมด</div>
            <div id="v2StatTotal" class="fs-3 fw-bold text-primary">0</div>
            <div class="text-muted" style="font-size:0.75rem;">ปี <span id="v2SourceYearLabel">2569</span></div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card p-3 border-0 shadow-sm text-center" style="background:#ecfdf5;border-radius:12px;">
            <div class="text-muted small fw-bold">เลื่อนชั้น (Promote)</div>
            <div id="v2StatPromote" class="fs-3 fw-bold text-success">0</div>
            <div class="text-muted" style="font-size:0.75rem;">ขึ้นชั้นปีใหม่</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card p-3 border-0 shadow-sm text-center" style="background:#fefce8;border-radius:12px;">
            <div class="text-muted small fw-bold">จบ ป.6 (Graduate)</div>
            <div id="v2StatGraduate" class="fs-3 fw-bold text-warning">0</div>
            <div class="text-muted" style="font-size:0.75rem;">จบการศึกษา</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card p-3 border-0 shadow-sm text-center" style="background:#fff7ed;border-radius:12px;">
            <div class="text-muted small fw-bold">ซ้ำชั้น (Retain)</div>
            <div id="v2StatRetain" class="fs-3 fw-bold text-danger">0</div>
            <div class="text-muted" style="font-size:0.75rem;">เรียนชั้นเดิม</div>
          </div>
        </div>
      </div>

      <!-- 2. Alerts Container -->
      <div id="v2AlertsContainer" class="mb-3"></div>

      <!-- 3. Filter Controls -->
      <div class="card p-3 mb-3 border bg-light" style="border-radius:12px;">
        <div class="row g-2 align-items-center">
          <div class="col-md-4">
            <label for="v2FilterGrade" class="form-label small fw-bold mb-1">เลือกระดับชั้น:</label>
            <select id="v2FilterGrade" class="form-select form-select-sm">
              <option value="ALL">ทุกระดับชั้น (อ.1 - ป.6)</option>
              <option value="อ.1">อนุบาล 1</option>
              <option value="อ.2">อนุบาล 2</option>
              <option value="อ.3">อนุบาล 3</option>
              <option value="ป.1">ประถมศึกษาปีที่ 1</option>
              <option value="ป.2">ประถมศึกษาปีที่ 2</option>
              <option value="ป.3">ประถมศึกษาปีที่ 3</option>
              <option value="ป.4">ประถมศึกษาปีที่ 4</option>
              <option value="ป.5">ประถมศึกษาปีที่ 5</option>
              <option value="ป.6">ประถมศึกษาปีที่ 6</option>
            </select>
          </div>
          <div class="col-md-4">
            <label for="v2FilterAction" class="form-label small fw-bold mb-1">ตัวกรองคำสั่ง:</label>
            <select id="v2FilterAction" class="form-select form-select-sm">
              <option value="ALL">คำสั่งทั้งหมด</option>
              <option value="EXCEPTIONS">เฉพาะข้อยกเว้น (ซ้ำชั้น/ย้ายออก/รอพิจารณา)</option>
              <option value="promote">เลื่อนชั้นปกติ</option>
              <option value="retain">ซ้ำชั้น (Retain)</option>
              <option value="graduate">จบการศึกษา (Graduate)</option>
            </select>
          </div>
          <div class="col-md-4">
            <label for="v2SearchInput" class="form-label small fw-bold mb-1">ค้นหาชื่อ / รหัส:</label>
            <input type="text" id="v2SearchInput" class="form-control form-control-sm" placeholder="พิมพ์ชื่อ นามสกุล หรือรหัส...">
          </div>
        </div>
      </div>

      <!-- 4. Interactive Students Table -->
      <div class="table-responsive border rounded mb-3 bg-white" style="max-height: 440px; overflow-y: auto;">
        <table class="table table-hover table-sm align-middle mb-0" style="font-size:0.88rem;">
          <thead class="table-light sticky-top" style="z-index:2;">
            <tr>
              <th style="width:55px;" class="text-center">เลขที่</th>
              <th style="width:100px;">รหัส</th>
              <th>ชื่อ - นามสกุล</th>
              <th style="width:90px;" class="text-center">ชั้นเดิม</th>
              <th style="width:170px;">คำสั่งเปลี่ยนปี</th>
              <th style="width:100px;" class="text-center">ชั้นเป้าหมาย</th>
              <th>เหตุผลข้อยกเว้น / ซ้ำชั้น</th>
            </tr>
          </thead>
          <tbody id="v2StudentTableBody">
          </tbody>
        </table>
      </div>

      <!-- 5. Bottom Actions Toolbar -->
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 p-3 bg-light rounded border">
        <div>
          <span id="v2ChangeCountText" class="text-muted small">ยังไม่มีการแก้ไขคำตัดสิน</span>
        </div>
        <div class="d-flex gap-2">
          <button id="v2BtnSaveDecisions" type="button" class="btn btn-outline-primary btn-sm" disabled>
            <i class="bi bi-floppy me-1"></i>บันทึกคำตัดสิน
          </button>
          <button id="v2BtnValidate" type="button" class="btn btn-outline-success btn-sm">
            <i class="bi bi-shield-check me-1"></i>ตรวจความพร้อม
          </button>
          <button id="v2BtnApply" type="button" class="btn btn-danger btn-sm" disabled>
            <i class="bi bi-check2-circle me-1"></i>ยืนยันปิดปีและเลื่อนชั้น
          </button>
        </div>
      </div>

      <!-- 6. Historical Year Lock & Edit Management -->
      <div class="card p-3 mb-3 border bg-white mt-4" style="border-radius:12px;">
        <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
          <div>
            <h6 class="fw-bold mb-0 text-dark">
              <i class="bi bi-unlock-fill me-1 text-warning"></i>ระบบปลดล็อกแก้ไขปีการศึกษาย้อนหลัง (Historical Year Editing)
            </h6>
            <div class="text-muted small">
              กรณีต้องการแก้ไขคะแนน เวลาเรียน หรือสอบแก้ตัวในอดีต แอดมินสามารถปลดล็อกชั่วคราวได้
            </div>
          </div>
          <button id="v2BtnRefreshLocks" type="button" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-arrow-clockwise me-1"></i>รีเฟรชสถานะ
          </button>
        </div>
        <div id="v2YearLocksList" class="mt-2">
          <div class="text-muted small text-center py-2">กำลังโหลดข้อมูลสถานะปีการศึกษา...</div>
        </div>
      </div>

      <!-- 7. Transition History & Rollback -->
      <div class="card p-3 mb-3 border bg-white mt-3" style="border-radius:12px;">
        <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
          <div>
            <h6 class="fw-bold mb-0 text-dark">
              <i class="bi bi-clock-history me-1 text-danger"></i>ประวัติการเลื่อนชั้นและการย้อนกลับ (Rollback Transition)
            </h6>
            <div class="text-muted small">
              กรณีกดเลื่อนชั้นผิดพลาด สามารถสั่งย้อนระดับชั้นและคืนสถานะนักเรียนกลับสู่ปีเดิมได้ 100%
            </div>
          </div>
          <button id="v2BtnRefreshHistory" type="button" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-arrow-clockwise me-1"></i>รีเฟรชประวัติ
          </button>
        </div>
        <div id="v2TransitionHistoryList" class="mt-2">
          <div class="text-muted small text-center py-2">กำลังโหลดประวัติการเลื่อนชั้น...</div>
        </div>
      </div>
    </div>
  `;

  yearCardBody.appendChild(wizard);
  initAcademicYearTransitionV2Logic_();
}

function initAcademicYearTransitionV2Logic_() {
  let activeDraft = null;
  let allStudents = [];
  const modifiedMap = new Map();

  const draftStatusBadge = document.getElementById('v2DraftStatusBadge');
  const btnCreateDraft = document.getElementById('v2BtnCreateDraft');
  const wizardBody = document.getElementById('v2WizardBody');
  const statTotal = document.getElementById('v2StatTotal');
  const statPromote = document.getElementById('v2StatPromote');
  const statGraduate = document.getElementById('v2StatGraduate');
  const statRetain = document.getElementById('v2StatRetain');
  const sourceYearLabel = document.getElementById('v2SourceYearLabel');
  const alertsContainer = document.getElementById('v2AlertsContainer');
  const filterGrade = document.getElementById('v2FilterGrade');
  const filterAction = document.getElementById('v2FilterAction');
  const searchInput = document.getElementById('v2SearchInput');
  const tableBody = document.getElementById('v2StudentTableBody');
  const changeCountText = document.getElementById('v2ChangeCountText');
  const btnSaveDecisions = document.getElementById('v2BtnSaveDecisions');
  const btnValidate = document.getElementById('v2BtnValidate');
  const btnApply = document.getElementById('v2BtnApply');

  function updateStatusBadge(status) {
    if (!draftStatusBadge) return;
    if (status === 'validated') {
      draftStatusBadge.className = 'badge bg-success px-3 py-2 fs-6';
      draftStatusBadge.innerHTML = '<i class="bi bi-check-circle me-1"></i>ตรวจสอบแล้ว (พร้อมเลื่อนชั้น)';
    } else if (status === 'draft') {
      draftStatusBadge.className = 'badge bg-warning text-dark px-3 py-2 fs-6';
      draftStatusBadge.innerHTML = '<i class="bi bi-pencil-square me-1"></i>ฉบับร่าง (ยังไม่ยืนยัน)';
    } else if (status === 'applied') {
      draftStatusBadge.className = 'badge bg-info text-dark px-3 py-2 fs-6';
      draftStatusBadge.innerHTML = '<i class="bi bi-check2-all me-1"></i>ดำเนินการปิดปีสำเร็จแล้ว';
    } else {
      draftStatusBadge.className = 'badge bg-secondary px-3 py-2 fs-6';
      draftStatusBadge.textContent = 'ยังไม่ได้สร้างฉบับร่าง';
    }
  }

  function updateAlerts(blockers, warnings) {
    if (!alertsContainer) return;
    let html = '';
    const bList = Array.isArray(blockers) ? blockers : [];
    const wList = Array.isArray(warnings) ? warnings : [];

    if (bList.length > 0) {
      html += `<div class="alert alert-danger py-2 mb-2">
        <div class="fw-bold"><i class="bi bi-exclamation-octagon-fill me-1"></i>มีข้อขัดข้องที่ต้องแก้ไขก่อนปิดปี (${bList.length} ข้อ):</div>
        <ul class="mb-0 ps-3 mt-1 small">
          ${bList.map(b => `<li>${b}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (wList.length > 0) {
      html += `<div class="alert alert-warning py-2 mb-2">
        <div class="fw-bold"><i class="bi bi-exclamation-triangle-fill me-1"></i>คำเตือน (${wList.length} ข้อ):</div>
        <ul class="mb-0 ps-3 mt-1 small">
          ${wList.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>`;
    }

    alertsContainer.innerHTML = html;
  }

  function recalculateStats() {
    let promote = 0;
    let graduate = 0;
    let retain = 0;

    allStudents.forEach(st => {
      const mod = modifiedMap.get(st.studentId);
      const action = mod ? mod.action : st.selectedAction;
      if (action === 'promote') promote++;
      else if (action === 'graduate') graduate++;
      else if (action === 'retain') retain++;
    });

    if (statTotal) statTotal.textContent = allStudents.length;
    if (statPromote) statPromote.textContent = promote;
    if (statGraduate) statGraduate.textContent = graduate;
    if (statRetain) statRetain.textContent = retain;

    const modCount = modifiedMap.size;
    if (changeCountText) {
      changeCountText.textContent = modCount > 0
        ? `มีการแก้ไขคำตัดสิน ${modCount} รายการ (ยังไม่ได้บันทึก)`
        : 'ยังไม่มีการแก้ไขคำตัดสิน';
    }
    if (btnSaveDecisions) btnSaveDecisions.disabled = (modCount === 0);
  }

  function getTargetGradeFor(sourceGrade, action) {
    if (action === 'retain') return sourceGrade;
    if (action === 'graduate' || action === 'transfer_out' || action === 'withdraw' || action === 'deceased') return '-';
    switch (sourceGrade) {
      case 'อ.1': return 'อ.2';
      case 'อ.2': return 'อ.3';
      case 'อ.3': return 'ป.1';
      case 'ป.1': return 'ป.2';
      case 'ป.2': return 'ป.3';
      case 'ป.3': return 'ป.4';
      case 'ป.4': return 'ป.5';
      case 'ป.5': return 'ป.6';
      default: return sourceGrade;
    }
  }

  function renderStudentRows() {
    if (!tableBody) return;
    const gFilter = filterGrade ? filterGrade.value : 'ALL';
    const aFilter = filterAction ? filterAction.value : 'ALL';
    const search = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const filtered = allStudents.filter(st => {
      if (gFilter !== 'ALL' && st.sourceGrade !== gFilter) return false;
      const mod = modifiedMap.get(st.studentId);
      const action = mod ? mod.action : st.selectedAction;
      if (aFilter === 'EXCEPTIONS') {
        if (action === 'promote' || (action === 'graduate' && st.sourceGrade === 'ป.6')) return false;
      } else if (aFilter !== 'ALL' && action !== aFilter) {
        return false;
      }
      if (search) {
        const full = `${st.studentId} ${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}`.toLowerCase();
        if (!full.includes(search)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">ไม่พบข้อมูลนักเรียนตามเงื่อนไขที่เลือก</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(st => {
      const mod = modifiedMap.get(st.studentId);
      const action = mod ? mod.action : st.selectedAction;
      const reason = mod ? mod.reasonNote : (st.reasonNote || '');
      const targetGrade = getTargetGradeFor(st.sourceGrade, action);
      const isRetain = action === 'retain';
      const rowClass = isRetain ? 'table-warning' : (mod ? 'table-info' : '');

      return `
        <tr class="${rowClass}" data-student-id="${st.studentId}">
          <td class="text-center">${st.studentNumber || '-'}</td>
          <td><code>${st.studentId}</code></td>
          <td class="fw-semibold">${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}</td>
          <td class="text-center"><span class="badge bg-light text-dark border">${st.sourceGrade}</span></td>
          <td>
            <select class="form-select form-select-sm v2-action-select" data-id="${st.studentId}">
              <option value="promote" ${action === 'promote' ? 'selected' : ''}>↗️ เลื่อนชั้น</option>
              <option value="retain" ${action === 'retain' ? 'selected' : ''}>🔁 ซ้ำชั้น (Retain)</option>
              <option value="graduate" ${action === 'graduate' ? 'selected' : ''}>🎓 จบการศึกษา</option>
              <option value="transfer_out" ${action === 'transfer_out' ? 'selected' : ''}>ย้ายออก</option>
              <option value="withdraw" ${action === 'withdraw' ? 'selected' : ''}>ลาออก</option>
              <option value="pending_review" ${action === 'pending_review' ? 'selected' : ''}>⏳ รอพิจารณา</option>
            </select>
          </td>
          <td class="text-center v2-target-grade-cell">
            <span class="badge ${isRetain ? 'bg-danger' : 'bg-primary'}">${targetGrade}</span>
          </td>
          <td>
            <input type="text" class="form-control form-control-sm v2-reason-input ${isRetain && !reason ? 'border-danger' : ''}"
              data-id="${st.studentId}"
              value="${reason ? reason.replace(/"/g, '&quot;') : ''}"
              placeholder="${isRetain ? 'ระบุเหตุผลซ้ำชั้น (บังคับ)' : 'หมายเหตุเพิ่มเติม (ถ้ามี)'}">
          </td>
        </tr>
      `;
    }).join('');

    tableBody.querySelectorAll('.v2-action-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const action = e.target.value;
        const row = e.target.closest('tr');
        const st = allStudents.find(s => s.studentId === id);
        if (!st) return;

        const reasonInput = row.querySelector('.v2-reason-input');
        const reason = reasonInput ? reasonInput.value.trim() : '';
        const targetGrade = getTargetGradeFor(st.sourceGrade, action);

        modifiedMap.set(id, {
          studentId: id,
          action,
          targetGrade: (action === 'retain' ? st.sourceGrade : (action === 'graduate' ? null : targetGrade)),
          targetRoom: st.sourceRoom || '1',
          reasonNote: reason
        });

        const targetBadge = row.querySelector('.v2-target-grade-cell');
        if (targetBadge) {
          targetBadge.innerHTML = `<span class="badge ${action === 'retain' ? 'bg-danger' : 'bg-primary'}">${targetGrade}</span>`;
        }

        if (action === 'retain') {
          row.className = 'table-warning';
          if (reasonInput) reasonInput.placeholder = 'ระบุเหตุผลซ้ำชั้น (บังคับ)';
        } else {
          row.className = 'table-info';
        }

        recalculateStats();
        if (activeDraft && activeDraft.status === 'validated') {
          activeDraft.status = 'draft';
          updateStatusBadge('draft');
          if (btnApply) btnApply.disabled = true;
        }
      });
    });

    tableBody.querySelectorAll('.v2-reason-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const id = e.target.dataset.id;
        const reason = e.target.value.trim();
        const row = e.target.closest('tr');
        const actionSel = row.querySelector('.v2-action-select');
        const action = actionSel ? actionSel.value : 'promote';
        const st = allStudents.find(s => s.studentId === id);
        if (!st) return;

        const targetGrade = getTargetGradeFor(st.sourceGrade, action);
        modifiedMap.set(id, {
          studentId: id,
          action,
          targetGrade: (action === 'retain' ? st.sourceGrade : (action === 'graduate' ? null : targetGrade)),
          targetRoom: st.sourceRoom || '1',
          reasonNote: reason
        });

        if (action === 'retain') {
          if (!reason) e.target.classList.add('border-danger');
          else e.target.classList.remove('border-danger');
        }
        recalculateStats();
      });
    });
  }

  if (filterGrade) filterGrade.addEventListener('change', renderStudentRows);
  if (filterAction) filterAction.addEventListener('change', renderStudentRows);
  if (searchInput) searchInput.addEventListener('input', renderStudentRows);

  // 6. Year Locks Management
  const yearLocksContainer = document.getElementById('v2YearLocksList');
  const btnRefreshLocks = document.getElementById('v2BtnRefreshLocks');

  function loadAcademicYearLocks_() {
    if (!yearLocksContainer || !google?.script?.run) return;
    yearLocksContainer.innerHTML = '<div class="text-muted small text-center py-2"><span class="spinner-border spinner-border-sm me-2"></span>กำลังโหลดสถานะปีการศึกษา...</div>';

    google.script.run
      .withSuccessHandler((res) => {
        if (!res || !res.success) {
          yearLocksContainer.innerHTML = '<div class="alert alert-warning py-2 small mb-0">ไม่สามารถโหลดสถานะปีการศึกษาได้</div>';
          return;
        }
        const years = Array.isArray(res.years) ? res.years : [];
        if (years.length === 0) {
          yearLocksContainer.innerHTML = '<div class="text-muted small text-center py-2">ยังไม่มีประวัติปีการศึกษาในระบบ</div>';
          return;
        }

        yearLocksContainer.innerHTML = `
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0" style="font-size:0.88rem;">
              <thead class="table-light">
                <tr>
                  <th style="width:120px;">ปีการศึกษา</th>
                  <th style="width:120px;">สถานะปี</th>
                  <th style="width:160px;">สถานะการล็อก</th>
                  <th>หมายเหตุ / เหตุผลการล็อก</th>
                  <th style="width:160px;" class="text-end">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${years.map(y => {
                  const isCurrent = y.isCurrent;
                  const isLocked = y.isLocked;
                  return `
                    <tr>
                      <td class="fw-bold">
                        ปี ${y.academicYear} ${isCurrent ? '<span class="badge bg-primary ms-1">ปีปัจจุบัน</span>' : ''}
                      </td>
                      <td>
                        <span class="badge ${y.status === 'active' ? 'bg-success' : 'bg-secondary'}">${y.status === 'active' ? 'เปิดใช้งาน' : 'ปิดปีแล้ว'}</span>
                      </td>
                      <td>
                        ${isLocked
                          ? '<span class="badge bg-danger"><i class="bi bi-lock-fill me-1"></i>ล็อก (อ่านอย่างเดียว)</span>'
                          : '<span class="badge bg-success"><i class="bi bi-unlock-fill me-1"></i>เปิดให้แก้ไข</span>'}
                      </td>
                      <td class="small text-muted">${y.lockReason || '-'}</td>
                      <td class="text-end">
                        ${isLocked
                          ? `<button type="button" class="btn btn-outline-warning btn-sm v2-btn-unlock" data-year="${y.academicYear}">
                              <i class="bi bi-unlock-fill me-1"></i>ปลดล็อกเพื่อแก้ไข
                            </button>`
                          : `<button type="button" class="btn btn-outline-secondary btn-sm v2-btn-lock" data-year="${y.academicYear}">
                              <i class="bi bi-lock-fill me-1"></i>ล็อกปีการศึกษา
                            </button>`}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;

        // Attach unlock/lock listeners
        yearLocksContainer.querySelectorAll('.v2-btn-unlock').forEach(btn => {
          btn.addEventListener('click', () => {
            const yr = btn.dataset.year;
            const reason = prompt(`⚠️ ยืนยันปลดล็อกปีการศึกษา ${yr} เพื่อแก้ไขข้อมูลย้อนหลัง?\n\nกรุณาระบุเหตุผลการปลดล็อก (เช่น แก้ไขคะแนนสอบซ่อม ป.6):`, 'แก้ไขคะแนนตกหล่น');
            if (reason === null) return;
            if (!reason.trim()) {
              alert('⚠️ กรุณาระบุเหตุผลการปลดล็อกเพื่อบันทึกประวัติการตรวจสอบ (Audit Log)');
              return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังปลดล็อก...';

            google.script.run
              .withSuccessHandler((r) => {
                if (!r || !r.success) {
                  alert('❌ ปลดล็อกไม่สำเร็จ: ' + (r?.message || 'ไม่ทราบสาเหตุ'));
                  btn.disabled = false;
                  return;
                }
                alert(`🔓 ปลดล็อกปีการศึกษา ${yr} เรียบร้อยแล้ว!\nขณะนี้คุณครูสามารถเข้าไปแก้ไขคะแนนหรือเวลาเรียนของปี ${yr} ได้ตามปกติ\nเมื่อแก้ไขเสร็จแล้ว กรุณากดปุ่มล็อกปีตามเดิมครับ`);
                loadAcademicYearLocks_();
              })
              .withFailureHandler((err) => {
                alert('❌ เกิดข้อผิดพลาด: ' + (err?.message || err));
                btn.disabled = false;
              })
              .setAcademicYearLock(yr, false, reason.trim());
          });
        });

        yearLocksContainer.querySelectorAll('.v2-btn-lock').forEach(btn => {
          btn.addEventListener('click', () => {
            const yr = btn.dataset.year;
            if (!confirm(`🔒 ยืนยันสิ้นสุดการแก้ไขและล็อกปีการศึกษา ${yr} กลับเป็น Read-only?`)) return;

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังล็อก...';

            google.script.run
              .withSuccessHandler((r) => {
                if (!r || !r.success) {
                  alert('❌ ล็อกไม่สำเร็จ: ' + (r?.message || 'ไม่ทราบสาเหตุ'));
                  btn.disabled = false;
                  return;
                }
                alert(`🔒 ล็อกปีการศึกษา ${yr} กลับเป็น Read-only เรียบร้อยแล้ว!`);
                loadAcademicYearLocks_();
              })
              .withFailureHandler((err) => {
                alert('❌ เกิดข้อผิดพลาด: ' + (err?.message || err));
                btn.disabled = false;
              })
              .setAcademicYearLock(yr, true, 'เสร็จสิ้นการแก้ไขและล็อกเก็บเข้าคลังประวัติ');
          });
        });
      })
      .withFailureHandler((err) => {
        yearLocksContainer.innerHTML = `<div class="alert alert-danger py-2 small mb-0">❌ เกิดข้อผิดพลาด: ${err?.message || err}</div>`;
      })
      .getAcademicYearsStatus();
  }

  if (btnRefreshLocks) btnRefreshLocks.addEventListener('click', loadAcademicYearLocks_);

  // 7. Transition History & Rollback Management
  const historyContainer = document.getElementById('v2TransitionHistoryList');
  const btnRefreshHistory = document.getElementById('v2BtnRefreshHistory');

  function loadTransitionHistory_() {
    if (!historyContainer || !google?.script?.run) return;
    historyContainer.innerHTML = '<div class="text-muted small text-center py-2"><span class="spinner-border spinner-border-sm me-2"></span>กำลังโหลดประวัติการเลื่อนชั้น...</div>';

    google.script.run
      .withSuccessHandler((res) => {
        if (!res || !res.success) {
          historyContainer.innerHTML = '<div class="alert alert-warning py-2 small mb-0">ไม่สามารถโหลดประวัติการเลื่อนชั้นได้</div>';
          return;
        }
        const items = Array.isArray(res.items) ? res.items : [];
        if (items.length === 0) {
          historyContainer.innerHTML = '<div class="text-muted small text-center py-2">ยังไม่มีประวัติการเปลี่ยนปีการศึกษาในระบบ</div>';
          return;
        }

        historyContainer.innerHTML = `
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0" style="font-size:0.88rem;">
              <thead class="table-light">
                <tr>
                  <th style="width:130px;">รายการเลื่อนชั้น</th>
                  <th style="width:110px;">สถานะ</th>
                  <th style="width:170px;">ยอดนักเรียน</th>
                  <th>วันที่ดำเนินการ</th>
                  <th style="width:150px;" class="text-end">การย้อนกลับ</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => {
                  const isApplied = (it.status === 'applied');
                  const isRolledBack = (it.status === 'rolled_back');
                  return `
                    <tr>
                      <td class="fw-bold">
                        ${it.from_year} ➔ ${it.to_year}
                      </td>
                      <td>
                        <span class="badge ${isApplied ? 'bg-success' : (isRolledBack ? 'bg-secondary' : 'bg-info')}">
                          ${isApplied ? 'เลื่อนชั้นแล้ว' : (isRolledBack ? 'ย้อนกลับแล้ว' : it.status)}
                        </span>
                      </td>
                      <td class="small">
                        รวม ${it.student_count || 0} คน (เลื่อน ${it.promoted_count || 0} / จบ ${it.graduated_count || 0})
                      </td>
                      <td class="small text-muted">
                        ${it.applied_at ? new Date(it.applied_at).toLocaleString('th-TH') : '-'}
                      </td>
                      <td class="text-end">
                        ${isApplied
                          ? `<button type="button" class="btn btn-outline-danger btn-sm v2-btn-rollback" data-id="${it.id}" data-from="${it.from_year}" data-to="${it.to_year}">
                              <i class="bi bi-arrow-counterclockwise me-1"></i>ขอย้อนกลับ (Rollback)
                            </button>`
                          : '<span class="text-muted small">-</span>'}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;

        // Attach Rollback listeners
        historyContainer.querySelectorAll('.v2-btn-rollback').forEach(btn => {
          btn.addEventListener('click', () => {
            const transId = btn.dataset.id;
            const fromYear = btn.dataset.from;
            const toYear = btn.dataset.to;

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>ตรวจความพร้อม...';

            google.script.run
              .withSuccessHandler((prev) => {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-arrow-counterclockwise me-1"></i>ขอย้อนกลับ (Rollback)';

                if (!prev || !prev.success) {
                  alert('❌ ไม่สามารถตรวจสอบการย้อนกลับได้: ' + (prev?.message || 'ไม่ทราบสาเหตุ'));
                  return;
                }

                if (!prev.canRollback) {
                  const blockers = Array.isArray(prev.blockers) ? prev.blockers.join('\n') : 'ระบบไม่อนุญาตให้ย้อนกลับ';
                  alert(`⚠️ ไม่สามารถย้อนกลับได้ในขณะนี้:\n\n${blockers}`);
                  return;
                }

                showRollbackConfirmationModal_(transId, fromYear, toYear, () => {
                  loadTransitionHistory_();
                  loadAcademicYearLocks_();
                  if (activeDraft?.id) loadDraftDetails(activeDraft.id);
                }, prev.revision);
              })
              .withFailureHandler((err) => {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-arrow-counterclockwise me-1"></i>ขอย้อนกลับ (Rollback)';
                alert('❌ เกิดข้อผิดพลาด: ' + (err?.message || err));
              })
              .previewTransitionRollbackV2(transId);
          });
        });
      })
      .withFailureHandler((err) => {
        historyContainer.innerHTML = `<div class="alert alert-danger py-2 small mb-0">❌ เกิดข้อผิดพลาด: ${err?.message || err}</div>`;
      })
      .getAcademicYearTransitions();
  }

  if (btnRefreshHistory) btnRefreshHistory.addEventListener('click', loadTransitionHistory_);

  // Initial load of locks and history
  loadAcademicYearLocks_();
  loadTransitionHistory_();

  function loadDraftDetails(draftId) {
    if (!google?.script?.run) return;
    google.script.run
      .withSuccessHandler((res) => {
        if (!res || !res.success) {
          alert('❌ โหลดข้อมูลฉบับร่างไม่สำเร็จ: ' + (res?.message || 'ไม่ทราบสาเหตุ'));
          return;
        }
        activeDraft = res.draft;
        allStudents = res.students || [];
        modifiedMap.clear();

        if (sourceYearLabel) sourceYearLabel.textContent = activeDraft.source_year;
        updateStatusBadge(activeDraft.status);
        updateAlerts(activeDraft.blockers, activeDraft.warnings);
        recalculateStats();
        renderStudentRows();

        if (wizardBody) wizardBody.style.display = 'block';

        if (btnApply) {
          const hasBlockers = Array.isArray(activeDraft.blockers) && activeDraft.blockers.length > 0;
          btnApply.disabled = (activeDraft.status !== 'validated' || hasBlockers);
        }
      })
      .withFailureHandler((err) => {
        alert('❌ เกิดข้อผิดพลาด: ' + (err?.message || err));
      })
      .getTransitionDraftV2(draftId);
  }

  if (btnCreateDraft) {
    btnCreateDraft.addEventListener('click', () => {
      const yearInput = document.getElementById('newAcademicYear');
      const targetYear = yearInput ? yearInput.value.trim() : '';
      btnCreateDraft.disabled = true;
      btnCreateDraft.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังจัดทำร่าง...';

      google.script.run
        .withSuccessHandler((res) => {
          btnCreateDraft.disabled = false;
          btnCreateDraft.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>รีเฟรชฉบับร่าง V2';
          if (!res || !res.success) {
            alert('❌ สร้างฉบับร่างไม่สำเร็จ: ' + (res?.message || 'ไม่ทราบสาเหตุ'));
            return;
          }
          loadDraftDetails(res.draftId);
        })
        .withFailureHandler((err) => {
          btnCreateDraft.disabled = false;
          btnCreateDraft.innerHTML = '<i class="bi bi-file-earmark-plus me-1"></i>สร้าง / ตรวจสอบฉบับร่าง V2';
          alert('❌ เกิดข้อผิดพลาด: ' + (err?.message || err));
        })
        .createTransitionDraftV2(targetYear);
    });
  }

  if (btnSaveDecisions) {
    btnSaveDecisions.addEventListener('click', () => {
      if (!activeDraft?.id) return;
      const decisions = Array.from(modifiedMap.values());
      if (decisions.length === 0) return;

      for (const d of decisions) {
        if (d.action === 'retain' && !d.reasonNote) {
          alert('⚠️ กรุณาระบุเหตุผลการซ้ำชั้นของนักเรียนรหัส ' + d.studentId);
          return;
        }
      }

      btnSaveDecisions.disabled = true;
      btnSaveDecisions.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังบันทึก...';

      google.script.run
        .withSuccessHandler((res) => {
          btnSaveDecisions.disabled = false;
          btnSaveDecisions.innerHTML = '<i class="bi bi-floppy me-1"></i>บันทึกคำตัดสิน';
          if (!res || !res.success) {
            alert('❌ บันทึกไม่สำเร็จ: ' + (res?.message || 'ไม่ทราบสาเหตุ'));
            return;
          }
          alert(`✅ บันทึกคำตัดสินเรียบร้อยแล้ว (${res.updatedCount} รายการ)`);
          loadDraftDetails(activeDraft.id);
        })
        .withFailureHandler((err) => {
          btnSaveDecisions.disabled = false;
          btnSaveDecisions.innerHTML = '<i class="bi bi-floppy me-1"></i>บันทึกคำตัดสิน';
          alert('❌ บันทึกไม่สำเร็จ: ' + (err?.message || err));
        })
        .saveTransitionDecisionsV2(activeDraft.id, decisions);
    });
  }

  if (btnValidate) {
    btnValidate.addEventListener('click', () => {
      if (!activeDraft?.id) return;
      btnValidate.disabled = true;
      btnValidate.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังตรวจสอบ...';

      google.script.run
        .withSuccessHandler((res) => {
          btnValidate.disabled = false;
          btnValidate.innerHTML = '<i class="bi bi-shield-check me-1"></i>ตรวจความพร้อม';
          if (!res || !res.success) {
            alert('❌ ตรวจความพร้อมไม่สำเร็จ: ' + (res?.message || 'ไม่ทราบสาเหตุ'));
            return;
          }
          if (res.canApply) {
            alert('✅ ตรวจสอบความพร้อมผ่านสมบูรณ์! พร้อมดำเนินการเลื่อนชั้น');
          } else {
            alert('⚠️ ตรวจพบข้อขัดข้อง กรุณาดูรายละเอียดในรายการแจ้งเตือน');
          }
          loadDraftDetails(activeDraft.id);
        })
        .withFailureHandler((err) => {
          btnValidate.disabled = false;
          btnValidate.innerHTML = '<i class="bi bi-shield-check me-1"></i>ตรวจความพร้อม';
          alert('❌ เกิดข้อผิดพลาด: ' + (err?.message || err));
        })
        .validateTransitionDraftV2(activeDraft.id);
    });
  }

  if (btnApply) {
    btnApply.addEventListener('click', () => {
      if (!activeDraft?.id || activeDraft.status !== 'validated') {
        alert('⚠️ ต้องผ่านการตรวจความพร้อม (Validate) ก่อนเลื่อนชั้น');
        return;
      }
      showApplyConfirmationModal_(activeDraft, () => {
        loadDraftDetails(activeDraft.id);
      });
    });
  }
}

function showApplyConfirmationModal_(draft, onComplete) {
  const modalId = 'pp5V2ApplyConfirmModal';
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();

  const expectedToken = `CONFIRM_APPLY_${draft.source_year}_TO_${draft.target_year}`;
  const modalEl = document.createElement('div');
  modalEl.id = modalId;
  modalEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999999;font-family:Sarabun,sans-serif;';
  modalEl.innerHTML = `
    <div style="background:#fff;border-radius:16px;max-width:550px;width:92%;padding:24px;box-shadow:0 20px 40px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
      <div class="d-flex align-items-center gap-2 mb-2 text-danger">
        <i class="bi bi-exclamation-triangle-fill fs-3"></i>
        <h4 class="mb-0 fw-bold">ยืนยันปิดปีและเลื่อนชั้นเรียน</h4>
      </div>
      <p class="text-muted small">
        ระบบจะดำเนินการใน Database Transaction เดียว และล็อกข้อมูลปี ${draft.source_year} เป็น Read-only
      </p>

      <div class="p-3 mb-3 rounded" style="background:#f8fafc;border:1px solid #e2e8f0;font-size:0.9rem;">
        <div class="row g-2">
          <div class="col-6"><strong>ปีการศึกษาเดิม:</strong> ${draft.source_year}</div>
          <div class="col-6 text-primary"><strong>ปีการศึกษาใหม่:</strong> ${draft.target_year}</div>
          <div class="col-6"><strong>เลื่อนชั้นขึ้นปีใหม่:</strong> ${draft.summary?.promoteCount || 0} คน</div>
          <div class="col-6"><strong>จบการศึกษา ป.6:</strong> ${draft.summary?.graduateCount || 0} คน</div>
          <div class="col-6 text-danger"><strong>ซ้ำชั้น:</strong> ${draft.summary?.retainCount || 0} คน</div>
          <div class="col-6"><strong>รวมทั้งหมด:</strong> ${draft.summary?.studentCount || 0} คน</div>
        </div>
      </div>

      <div class="mb-3">
        <label for="v2ApplyTokenInput" class="form-label small fw-bold text-danger">
          เพื่อความปลอดภัย กรุณาพิมพ์รหัสยืนยันด้านล่างนี้ลงในช่อง:
        </label>
        <div class="p-2 mb-2 bg-light border rounded text-center font-monospace fw-bold user-select-all" style="letter-spacing:1px;font-size:0.95rem;">
          ${expectedToken}
        </div>
        <input type="text" id="v2ApplyTokenInput" class="form-control text-center font-monospace" placeholder="พิมพ์ข้อความยืนยันที่นี่">
      </div>

      <div id="v2ApplyModalStatus" class="mb-3" style="display:none;"></div>

      <div class="d-flex justify-content-end gap-2">
        <button type="button" id="v2BtnModalCancel" class="btn btn-secondary btn-sm">ยกเลิก</button>
        <button type="button" id="v2BtnModalConfirm" class="btn btn-danger btn-sm" disabled>
          <i class="bi bi-lock-fill me-1"></i>ยืนยันปิดปีและเลื่อนชั้นทันที
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  const tokenInput = document.getElementById('v2ApplyTokenInput');
  const btnConfirm = document.getElementById('v2BtnModalConfirm');
  const btnCancel = document.getElementById('v2BtnModalCancel');
  const statusBox = document.getElementById('v2ApplyModalStatus');

  tokenInput.addEventListener('input', () => {
    btnConfirm.disabled = (tokenInput.value.trim() !== expectedToken);
  });

  btnCancel.addEventListener('click', () => {
    modalEl.remove();
  });

  btnConfirm.addEventListener('click', () => {
    btnConfirm.disabled = true;
    btnCancel.disabled = true;
    tokenInput.disabled = true;
    btnConfirm.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังดำเนินการเลื่อนชั้น...';

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.innerHTML = '<div class="alert alert-info py-2 small mb-0"><span class="spinner-border spinner-border-sm me-2"></span>ระบบกำลังอัปเดตทะเบียนนักเรียน ล็อกปีการศึกษา และตั้งค่าระบบใหม่...</div>';
    }

    google.script.run
      .withSuccessHandler((res) => {
        if (!res || !res.success) {
          btnConfirm.disabled = false;
          btnCancel.disabled = false;
          tokenInput.disabled = false;
          btnConfirm.innerHTML = '<i class="bi bi-lock-fill me-1"></i>ยืนยันปิดปีและเลื่อนชั้นทันที';
          if (statusBox) {
            statusBox.innerHTML = `<div class="alert alert-danger py-2 small mb-0">❌ ดำเนินการไม่สำเร็จ: ${res?.message || 'ไม่ทราบสาเหตุ'}</div>`;
          }
          return;
        }

        if (statusBox) {
          statusBox.innerHTML = `<div class="alert alert-success py-2 small mb-0">🎉 ปิดปี ${draft.source_year} และเลื่อนชั้นสู่ปี ${draft.target_year} สำเร็จเรียบร้อยแล้ว!</div>`;
        }

        setTimeout(() => {
          modalEl.remove();
          alert(`🎉 ยินดีด้วยครับ! การเลื่อนชั้นสู่ปี ${draft.target_year} เสร็จสมบูรณ์แล้ว\nระบบจะรีเฟรชการตั้งค่าใหม่`);
          window.location.reload();
        }, 1500);
      })
      .withFailureHandler((err) => {
        btnConfirm.disabled = false;
        btnCancel.disabled = false;
        tokenInput.disabled = false;
        btnConfirm.innerHTML = '<i class="bi bi-lock-fill me-1"></i>ยืนยันปิดปีและเลื่อนชั้นทันที';
        if (statusBox) {
          statusBox.innerHTML = `<div class="alert alert-danger py-2 small mb-0">❌ เกิดข้อผิดพลาด: ${err?.message || err}</div>`;
        }
      })
      .applyTransitionV2(draft.id, draft.source_revision, expectedToken);
  });
}


// หน้า GAS เดิมจำนวนมากเริ่มทำงานด้วย DOMContentLoaded แต่เมื่อถูกนำมาใส่ใน
// SPA เหตุการณ์จริงได้เกิดไปแล้ว ฟังก์ชันนี้เก็บเฉพาะ listener ที่เพิ่งติดตั้ง
// โดยหน้าปัจจุบันและเรียกทันที จึงไม่ปลุก listener เก่าของหน้าอื่นซ้ำ
async function installPageScriptsAfterDomReady_(page, installScripts) {
  if (document.readyState === 'loading') {
    await installScripts();
    return;
  }

  const originalAddEventListener = document.addEventListener;
  const pendingDomReady = [];
  document.addEventListener = function(type, listener, options) {
    if (type === 'DOMContentLoaded') {
      pendingDomReady.push(listener);
      return;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  try {
    await installScripts();
  } finally {
    document.addEventListener = originalAddEventListener;
  }

  pendingDomReady.forEach((listener) => {
    try {
      const result = typeof listener === 'function'
        ? listener.call(document, new Event('DOMContentLoaded'))
        : listener?.handleEvent?.(new Event('DOMContentLoaded'));
      if (result && typeof result.catch === 'function') {
        result.catch((error) => console.error('Page init failed:', page, error));
      }
    } catch (error) {
      console.error('Page init failed:', page, error);
    }
  });
}

// Page templates still carry their own <script> copies of libraries index.html already loads.
// A second Bootstrap 5 bundle re-binds every data-api handler (and throws on destroy), so skip it.
// Bootstrap 4 pages (graduation_management, with jQuery) are left alone.
function isDuplicateSharedLibrary_(src) {
  const url = String(src || '');
  if (/\/bootstrap@5\.[^/]*\/dist\/js\/bootstrap\.bundle(\.min)?\.js/i.test(url)) return !!window.bootstrap?.Modal;
  if (/xlsx[@/]0\.18\.\d+\/(dist\/)?xlsx\.full\.min\.js/i.test(url)) return !!window.XLSX;
  return false;
}

function executePageScripts(container, page) {
  try {
    const scripts = [...container.querySelectorAll('script')];
    installPageScriptsAfterDomReady_(page, () => {
      scripts.forEach(old => {
        try {
          if (old.src && (isDuplicateSharedLibrary_(old.src)
            || document.querySelector('script[src="' + old.getAttribute('src') + '"]') !== old)) {
            old.remove();
            return;
          }
          const s = document.createElement('script');
          [...old.attributes].forEach(a => s.setAttribute(a.name, a.value));
          // Inserted scripts default to async; keep page order so plugins run after their core
          // (fullcalendar/bootstrap5 threw "FullCalendar is not defined").
          if (old.src) s.async = false;
          if (old.innerHTML.trim()) s.textContent = old.innerHTML;
          old.parentNode.replaceChild(s, old);
        } catch (se) {}
      });
    });
    const fn = 'setup' + page.charAt(0).toUpperCase() + page.slice(1) + 'Page';
    if (typeof window[fn] === 'function') try { window[fn](); } catch (e) { if (DEV_MODE) console.error(e); }
  } catch (e) { if (DEV_MODE) console.error(e); }
}

/* =========================
   NAVIGATION
========================= */
window.navigateTo = function(page) {
  page = normalizeRetiredPage_(page);
  // "วิเคราะห์ผลสัมฤทธิ์ SAR" เปิดเป็นหน้าต่างป๊อปอัป ไม่ใช่หน้าเว็บ ลิงก์เมนู (รวมถึงเมนูลอย/รายการโปรด)
  // ถูกตัวจับคลิกเมนูส่งมาที่นี่ก่อน onclick ของลิงก์จะทำงาน จึงต้องเปิดป๊อปอัปจากตรงนี้
  if (page === 'sar_analytics') {
    try { closeFlyout(); } catch (_) {}
    try { closeMobileSidebar(); } catch (_) {}
    if (typeof showSarAnalyticsModal_ === 'function') showSarAnalyticsModal_();
    return;
  }
  if (page === 'login' || page === 'forgot_password') {
    navigateToAuthPage_(page);
    return;
  }
  if (page === 'one_page_report') {
    try { localStorage.setItem('pp6_report_format', 'single'); } catch(_) {}
    page = 'report_card_generator';
  }
  const DEBOUNCE_MS = 300;
  window.__lastNavAt__ = window.__lastNavAt__ || 0;
  const now = Date.now();
  if (now - window.__lastNavAt__ < DEBOUNCE_MS) return;
  window.__lastNavAt__ = now;

  closeFlyout();
  closeMobileSidebar();

  if (window.AppNavigation?.isLoading) {
    const since = window.NavGuard?.isLoadingSince || 0;
    if (!since || (Date.now() - since) <= 6000) return;
    window.AppNavigation.isLoading = false;
    window.NavGuard.isLoadingSince = 0;
  }

  showMainLoading();
  loadPage(page)
    .then(() => { 
      setActivePage(page); 
      updateURL(page); 
      if (typeof window.checkGlobalAcademicYearWarning === 'function') {
        window.checkGlobalAcademicYearWarning();
      }
    })
    .catch(() => showLoadError(page));
};

/* =========================
   NEW YEAR SETUP
========================= */
window.AppNavigation.setupNewYear = function() {
  if (!confirm('คุณต้องการสร้างชีตเช็คชื่อทั้งหมดสำหรับปีการศึกษาใหม่ใช่หรือไม่?\n\n(ระบบจะอ่านปีการศึกษาจากชีต global_settings และจะสร้างเฉพาะชีตที่ยังไม่มีอยู่เท่านั้น)')) return;
  alert('กำลังเริ่มเตรียมข้อมูลปีการศึกษาใหม่...\nกระบวนการนี้อาจใช้เวลา 1-2 นาที กรุณารอสักครู่');
  if (typeof google !== 'undefined' && google.script?.run) {
    google.script.run.withSuccessHandler(msg => alert('✅ ทำรายการสำเร็จ!\n\n' + msg)).withFailureHandler(err => alert('❌ เกิดข้อผิดพลาด:\n\n' + err.message)).setupNewAcademicYear(localStorage.getItem('authToken') || '');
  } else { alert('❌ เกิดข้อผิดพลาด: ไม่สามารถเชื่อมต่อกับ Google Apps Script ได้'); }
};

/* =========================
   CHECK SYSTEM UPDATE
========================= */
window.AppNavigation.checkSystemUpdate = function() {
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;';
    loadingOverlay.innerHTML = '<div style="background:#fff;padding:30px;border-radius:16px;text-align:center;"><div class="spinner-border text-primary" role="status" style="width:3rem;height:3rem;margin-bottom:20px;"></div><p style="color:#666;margin:0;">กำลังเช็คอัปเดต...</p></div>';
    document.body.appendChild(loadingOverlay);

    const token = localStorage.getItem('authToken') || '';
    google.script.run
      .withSuccessHandler(function(result) {
        loadingOverlay.remove();
        
        if (!result.success) {
          alert('❌ เกิดข้อผิดพลาด:\n\n' + (result.error || 'ไม่สามารถเช็คอัปเดตได้'));
          return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'updateModal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;';
        
        if (result.hasUpdate) {
          overlay.innerHTML = '<div style="background:#fff;padding:30px;border-radius:16px;max-width:600px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-family:sans-serif;max-height:80vh;overflow-y:auto;">' +
            '<h2 style="margin:0 0 8px;font-size:1.3rem;color:#10b981;">🎉 มีเวอร์ชันใหม่!</h2>' +
            '<p style="color:#666;margin:0 0 16px;font-size:0.9rem;">เวอร์ชันปัจจุบัน: <strong>' + result.currentVersion + '</strong> → เวอร์ชันใหม่: <strong style="color:#10b981;">' + result.latestVersion + '</strong></p>' +
            '<div style="background:#f0fdf4;border:2px solid #10b981;border-radius:12px;padding:16px;margin-bottom:16px;">' +
              '<p style="margin:0 0 12px;font-weight:bold;color:#333;">📋 วิธีอัปเดต:</p>' +
              '<pre style="background:#fff;padding:12px;border-radius:8px;font-size:0.8rem;color:#333;white-space:pre-wrap;text-align:left;line-height:1.6;">' + result.instructions + '</pre>' +
            '</div>' +
            '<div style="background:#e0f2fe;border-radius:12px;padding:12px;margin-bottom:16px;text-align:center;">' +
              '<a href="' + result.githubUrl + '" target="_blank" style="color:#0284c7;text-decoration:none;font-weight:600;">🔗 เปิด GitHub Repository</a>' +
            '</div>' +
            '<div style="text-align:right;">' +
              '<button onclick="document.getElementById(\'updateModal\').remove()" style="padding:8px 24px;background:#e0e0e0;color:#333;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">ปิด</button>' +
            '</div>' +
          '</div>';
        } else {
          overlay.innerHTML = '<div style="background:#fff;padding:30px;border-radius:16px;max-width:500px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-family:sans-serif;text-align:center;">' +
            '<div style="font-size:3rem;margin-bottom:16px;">✅</div>' +
            '<h2 style="margin:0 0 8px;font-size:1.3rem;color:#10b981;">ระบบเป็นเวอร์ชันล่าสุดแล้ว</h2>' +
            '<p style="color:#666;margin:0 0 16px;font-size:0.9rem;">เวอร์ชันปัจจุบัน: <strong>' + result.currentVersion + '</strong></p>' +
            '<div style="text-align:center;">' +
              '<button onclick="document.getElementById(\'updateModal\').remove()" style="padding:8px 24px;background:#10b981;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">ปิด</button>' +
            '</div>' +
          '</div>';
        }
        
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
      })
      .withFailureHandler(function(err) {
        loadingOverlay.remove();
        alert('❌ เกิดข้อผิดพลาด:\n\n' + err.message);
      })
      .checkAndNotifyUpdate(token);
  } else {
    alert('❌ ไม่สามารถเชื่อมต่อกับ Google Apps Script ได้');
  }
};

/* =========================
   EXPORT SYSTEM ZIP
========================= */
// คู่มือติดตั้งโรงเรียนอื่น (owner 2026-10-12): เปิดหน้าต่างคู่มือแทนการสร้างไฟล์ส่งออกแบบ Apps Script เดิม
// เนื้อหาอยู่ใน js/install-guide.js  ชุดติดตั้งจริงคือ GitHub Pac7584/pp5smart-newschool
window.AppNavigation.exportSystemZip = function() {
  if (window.PP5InstallGuide?.open) window.PP5InstallGuide.open();
};

/* =========================
   LOGIN HELPERS
========================= */
window.handleSuccessfulLogin = function(userData) {
  if (!userData || !userData.username) return;
  localStorage.setItem('loggedIn', 'true');
  localStorage.setItem('username', userData.username || '');
  localStorage.setItem('role', userData.role || 'teacher');
  const resolvedName = userData.displayName || userData.fullName || ((userData.firstName || '') + ' ' + (userData.lastName || '')).trim() || userData.username || '';
  localStorage.setItem('displayName', resolvedName);
  localStorage.setItem('firstName', userData.firstName || '');
  localStorage.setItem('lastName', userData.lastName || '');
  localStorage.setItem('className', userData.className || '');
  const base = window.location.origin + window.location.pathname;
  window.location.href = base + '?page=home_hub';
};

window.isLoggedIn = function() { return localStorage.getItem('loggedIn') === 'true' && localStorage.getItem('username'); };
window.redirectToLogin = function() {
  ['loggedIn','username','role','displayName','firstName','lastName','className','authToken']
    .forEach(key => localStorage.removeItem(key));
  window.__appInited = true;
  updateMode();
  const userChip = document.getElementById('appHeaderUserChip');
  if (userChip) userChip.style.display = 'none';
  navigateToAuthPage_('login');
};

/* =========================
   SIDEBAR FUNCTIONS
========================= */
function closeFlyout() {
  const fly = document.getElementById('submenuFlyout');
  if (fly) {
    fly.style.display = 'none';
    fly.style.visibility = 'hidden';
    fly.setAttribute('aria-hidden', 'true');
    fly.innerHTML = '';
  }
  document.querySelectorAll('.menu-header.flyout-active').forEach(h => h.classList.remove('flyout-active'));
}
window.closeFlyout = closeFlyout;

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar?.classList.remove('mobile-open');
  backdrop?.classList.remove('show');
  document.documentElement.classList.remove('menu-open');
  const icon = document.getElementById('mobileSidebarToggle')?.querySelector('i');
  if (icon) icon.className = 'bi bi-list';
}
window.closeMobileSidebar = closeMobileSidebar;

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar?.classList.add('mobile-open');
  backdrop?.classList.add('show');
  document.documentElement.classList.add('menu-open');
  const icon = document.getElementById('mobileSidebarToggle')?.querySelector('i');
  if (icon) icon.className = 'bi bi-x-lg';
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar?.classList.contains('mobile-open')) {
    closeMobileSidebar();
  } else {
    openMobileSidebar();
  }
}

function toggleDesktopSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const toggle = document.getElementById('sidebarToggle');
  const isCollapsed = sidebar?.classList.toggle('collapsed');
  mainContent?.classList.toggle('expanded', isCollapsed);
  toggle?.setAttribute('aria-expanded', !isCollapsed);
  if (isCollapsed) closeFlyout();
  setTimeout(function() {
    window.dispatchEvent(new CustomEvent('spa-layout-change', { detail: { sidebarCollapsed: !!isCollapsed } }));
  }, 320);
}

function openFlyout(menuGroup, trigger) {
  // Allow flyout on desktop and iPad landscape (touch >=992px)
  const flyout = document.getElementById('submenuFlyout');
  if (!flyout) return;
  
  const navLinks = menuGroup.querySelectorAll('.nav-item .nav-link');
  if (!navLinks.length) return;
  
  // 1. ส่ง group label ไปให้ flyout เพื่อจับคู่สี
  var groupLabel = menuGroup.getAttribute('aria-label') || '';
  flyout.setAttribute('data-group', groupLabel);

  // สร้างเนื้อหาเมนู
  flyout.innerHTML = Array.from(navLinks).map(link => {
    const icon = link.querySelector('i')?.outerHTML || '';
    const text = link.textContent.trim();
    const page = link.getAttribute('data-page') || '';
    const onclick = link.getAttribute('onclick') || '';
    if (page) {
      return '<a href="#" class="nav-link" data-page="' + page + '" role="menuitem">' + icon + '<span>' + text + '</span></a>';
    } else if (onclick) {
      return '<a href="#" class="nav-link" onclick="' + onclick + '" role="menuitem">' + icon + '<span>' + text + '</span></a>';
    }
    return '';
  }).join('');
  
  // 2. แสดงผลชั่วคราวเพื่อวัดขนาดที่แท้จริง (ลดปัญหาการคำนวณตำแหน่งผิดพลาด)
  flyout.style.display = 'block';
  flyout.style.visibility = 'hidden';
  flyout.style.top = '0px';
  flyout.style.left = '0px';
  
  const rect = trigger.getBoundingClientRect();
  let left = rect.right + 8;
  let top = rect.top;
  const flyWidth = 300;
  
  // วัดความสูงจริงหลัง Render
  const flyHeight = flyout.offsetHeight; 
  
  // 3. ปรับตำแหน่งไม่ให้หลุดขอบจอ
  if (left + flyWidth > window.innerWidth - 8) left = window.innerWidth - flyWidth - 8;
  if (top + flyHeight > window.innerHeight - 8) top = Math.max(8, window.innerHeight - flyHeight - 8);
  
  // 4. กำหนดตำแหน่งและทำให้มองเห็น
  flyout.style.left = left + 'px';
  flyout.style.top = top + 'px';
  flyout.style.visibility = 'visible';
  flyout.setAttribute('aria-hidden', 'false');
  
  trigger.classList.add('flyout-active');
}

function toggleAccordion(menuGroup) {
  const isWide = window.innerWidth >= 992;
  const isTouchNow = window.matchMedia('(pointer: coarse)').matches;
  // Only block accordion on desktop (non-touch wide screen)
  if (isWide && !isTouchNow) return;
  const isCollapsed = menuGroup.classList.contains('menu-collapsed');
  document.querySelectorAll('.menu-group').forEach(g => {
    if (g !== menuGroup) g.classList.add('menu-collapsed');
  });
  menuGroup.classList.toggle('menu-collapsed', !isCollapsed);
}

function handleSearch(query) {
  const sidebar = document.getElementById('sidebar');
  const menuGroups = document.querySelectorAll('.menu-group');
  query = query.toLowerCase().trim();
  
  if (!query) {
    sidebar?.classList.remove('searching');
    menuGroups.forEach(group => {
      group.style.display = '';
      group.querySelectorAll('.nav-item').forEach(item => item.style.display = '');
    });
    clearMenuHighlights_();
    return;
  }
  
  sidebar?.classList.add('searching');
  menuGroups.forEach(group => {
    const headerText = String(group.querySelector('.menu-header')?.textContent || '').toLowerCase();
    const headerMatches = headerText.includes(query);
    const items = group.querySelectorAll('.nav-item');
    let hasVisible = headerMatches && items.length === 0;
    items.forEach(item => {
      const link = item.querySelector('.nav-link');
      const raw = link?.querySelector('.nav-label')?.dataset?.rawLabel || link?.textContent || '';
      const text = String(raw).toLowerCase();
      const match = headerMatches || text.includes(query);
      item.style.display = match ? 'block' : 'none';
      if (match) hasVisible = true;
    });
    group.style.display = hasVisible ? '' : 'none';
  });

  highlightMenuMatches_(query);
}

function clearMenuHighlights_() {
  document.querySelectorAll('.nav-label').forEach(el => {
    const raw = el.dataset.rawLabel || el.textContent;
    el.innerHTML = escapeHtml_(raw);
  });
}

function highlightMenuMatches_(query) {
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.style.display === 'none') return;
    const labelEl = item.querySelector('.nav-label');
    if (!labelEl) return;
    const raw = labelEl.dataset.rawLabel || labelEl.textContent;
    const lower = String(raw).toLowerCase();
    const idx = lower.indexOf(query);
    if (idx < 0) {
      labelEl.innerHTML = escapeHtml_(raw);
      return;
    }
    const before = raw.slice(0, idx);
    const mid = raw.slice(idx, idx + query.length);
    const after = raw.slice(idx + query.length);
    labelEl.innerHTML = escapeHtml_(before) + '<mark>' + escapeHtml_(mid) + '</mark>' + escapeHtml_(after);
  });
}

function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFavorites_() {
  try {
    const raw = localStorage.getItem('favPages');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch (_e) {
    return [];
  }
}

function setFavorites_(pages) {
  const uniq = Array.from(new Set((pages || []).filter(Boolean)));
  try { localStorage.setItem('favPages', JSON.stringify(uniq)); } catch (_e) {}
  renderMobileQuickMenu_();
  syncFavoriteStars_();
}

function ensureDefaultFavorites_() {
  const role = localStorage.getItem('role') || 'teacher';
  const existing = getFavorites_();
  if (existing.length) return;
  if (role === 'admin') {
    setFavorites_(['home_hub','new_settings_editor','logo_management','subjectManager','teacher_editor']);
  } else if (role === 'registrar') {
    setFavorites_(['home_hub','studentList','deleteStudent','student_transfer','export_pdf_page']);
  } else {
    setFavorites_(['home_hub','attendance_daily','score_table_viewer','studentList','export_pdf_page']);
  }
}

function syncFavoriteStars_() {
  const fav = new Set(getFavorites_());
  document.querySelectorAll('.fav-toggle').forEach(btn => {
    const page = btn.getAttribute('data-page') || '';
    btn.classList.toggle('active', fav.has(page));
    btn.setAttribute('aria-pressed', fav.has(page) ? 'true' : 'false');
    const icon = btn.querySelector('i');
    if (icon) icon.className = fav.has(page) ? 'bi bi-star-fill' : 'bi bi-star';
  });
}

function attachFavoriteStars_() {
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    if (link.querySelector('.fav-toggle')) return;

    const page = link.getAttribute('data-page') || '';
    const labelText = link.textContent.trim();

    const label = document.createElement('span');
    label.className = 'nav-label';
    label.dataset.rawLabel = labelText;
    label.textContent = labelText;

    const icon = link.querySelector('i');
    if (icon) {
      link.innerHTML = '';
      link.appendChild(icon);
      link.appendChild(label);
    } else {
      link.textContent = '';
      link.appendChild(label);
    }

    const btn = document.createElement('button');
    btn.className = 'fav-toggle';
    btn.type = 'button';
    btn.setAttribute('data-page', page);
    btn.setAttribute('aria-label', 'เพิ่ม/ลบเมนูโปรด');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<i class="bi bi-star"></i>';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const current = getFavorites_();
      const set = new Set(current);
      if (set.has(page)) set.delete(page);
      else set.add(page);
      setFavorites_(Array.from(set));
    });
    link.appendChild(btn);
  });
}

function renderMobileQuickMenu_() {
  const wrap = document.getElementById('mobileQuickMenu');
  if (!wrap) return;
  const currentPage = document.body.getAttribute('data-current-page') || '';
  const fav = getFavorites_();
  const pages = currentPage === 'home_hub'
    ? ['home_hub', 'attendance_daily', 'score_table_viewer']
    : (fav && fav.length) ? fav.slice(0, 4) : ['home_hub','attendance_daily','score_table_viewer','studentList'];
  const moreBtn = { page: '__more__', label: 'เพิ่มเติม', icon: '<i class="bi bi-three-dots"></i>' };

  const renderBtn = (page) => {
    if (page === '__more__') {
      return '<button class="quick-btn quick-more" type="button" onclick="document.getElementById(\'mobileSidebarToggle\').click();" aria-label="เมนูเพิ่มเติม"><span class="quick-ico"><i class="bi bi-three-dots"></i></span><span class="quick-label">เพิ่มเติม</span></button>';
    }
    const link = document.querySelector('.nav-link[data-page="' + page + '"]');
    // A previous admin session can leave favorites whose sidebar entries were removed.
    // Never recreate a menu entry from its saved page name without an allowed link.
    if (!link || link.closest('.nav-item')?.hidden) return '';
    const iconHtml = link?.querySelector('i')?.outerHTML || '<i class="bi bi-grid"></i>';
    const shortLabels = { home_hub: 'หน้าหลัก', attendance_daily: 'เช็กชื่อ', score_table_viewer: 'คะแนน', studentList: 'นักเรียน' };
    const label = shortLabels[page] || link?.querySelector('.nav-label')?.dataset?.rawLabel || link?.textContent?.trim() || page;
    const activeClass = page === currentPage ? ' active' : '';
    return '<button class="quick-btn' + activeClass + '" type="button" onclick="navigateTo(\'' + page + '\')" aria-label="' + escapeHtml_(label) + '"' + (activeClass ? ' aria-current="page"' : '') + '><span class="quick-ico">' + iconHtml + '</span><span class="quick-label">' + escapeHtml_(label) + '</span></button>';
  };

  wrap.innerHTML = pages.map(p => renderBtn(p)).join('') + renderBtn(moreBtn.page);
  watchMobileQuickMenuHeight_(wrap);
}

// ความสูงจริงของเมนูล่างจอมือถือ -> --pp5-mobile-menu-h (0 เมื่อเมนูซ่อน เช่นจอคอม)
// แถบ/ปุ่มที่ fixed ไว้ล่างจอ (ปุ่มพิมพ์ ปพ.6, แถบบันทึกเช็คชื่อ, ข้อความแจ้งเตือน) ใช้ค่านี้ยกตัวเองขึ้นเหนือเมนู
// เดิมปุ่มพิมพ์ ปพ.6 จมอยู่ใต้เมนูบนมือถือจนหาไม่เจอ
function watchMobileQuickMenuHeight_(menu) {
  if (!menu || menu.__pp5HeightWatch) return;
  menu.__pp5HeightWatch = true;
  const update = function() {
    const shown = getComputedStyle(menu).display !== 'none';
    // แถบลอยเหนือขอบจอ: ใช้ระยะจากขอบบนของแถบถึงขอบล่างจอ (รวมช่องว่างใต้แถบ) ไม่ใช่ความสูงของแถบอย่างเดียว
    const height = shown ? Math.ceil(Math.max(0, window.innerHeight - menu.getBoundingClientRect().top)) : 0;
    const value = height + 'px';
    if (document.documentElement.style.getPropertyValue('--pp5-mobile-menu-h') !== value) {
      document.documentElement.style.setProperty('--pp5-mobile-menu-h', value);
    }
  };
  update();
  if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(menu);
  window.addEventListener('resize', update);
}

/* =========================
   SUPABASE INVITE / RECOVERY PASSWORD SETUP
========================= */
function getSupabasePasswordFlow_() {
  try {
    const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const type = params.get('type');
    if (type === 'invite' || type === 'recovery') return { type, error: '' };
    const errorCode = params.get('error_code') || '';
    const errorDescription = params.get('error_description') || '';
    if (errorCode || errorDescription) return { type: 'error', error: errorDescription || errorCode };
  } catch (_) {}
  return null;
}

function renderSupabasePasswordSetup_(flow, sessionReady) {
  const isError = flow?.type === 'error' || !sessionReady;
  const safeMessage = isError
    ? 'ลิงก์นี้ไม่สามารถใช้งานได้หรือหมดอายุแล้ว กรุณาใช้ลิงก์เชิญฉบับล่าสุด'
    : 'ตั้งรหัสผ่านสำหรับบัญชีผู้ดูแลระบบ';
  document.body.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(135deg,color-mix(in srgb, var(--primary-light) 9%, #fff),#f8fafc);font-family:'Sarabun',sans-serif;">
      <section style="width:min(100%,480px);background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:28px;box-shadow:0 18px 45px rgba(15,23,42,.12);">
        <div style="width:52px;height:52px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:color-mix(in srgb, var(--primary-light) 9%, #fff);color:var(--primary);font-size:26px;margin-bottom:16px;">🔐</div>
        <h1 style="font-size:24px;margin:0 0 8px;color:#0f172a;">ตั้งรหัสผ่านระบบ ปพ.5</h1>
        <p id="invitePasswordMessage" style="margin:0 0 22px;color:${isError ? '#b91c1c' : '#64748b'};line-height:1.6;">${safeMessage}</p>
        ${isError ? `
          <a href="?page=login" style="display:block;text-align:center;padding:12px 16px;border-radius:10px;background:var(--primary);color:#fff;text-decoration:none;font-weight:700;">กลับหน้าเข้าสู่ระบบ</a>
        ` : `
          <form id="invitePasswordForm">
            <label for="inviteNewPassword" style="display:block;font-weight:700;color:#334155;margin-bottom:6px;">รหัสผ่านใหม่</label>
            <input id="inviteNewPassword" type="password" minlength="10" autocomplete="new-password" required style="width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;margin-bottom:6px;">
            <div style="font-size:13px;color:#64748b;margin-bottom:16px;">อย่างน้อย 10 ตัวอักษร</div>
            <label for="inviteConfirmPassword" style="display:block;font-weight:700;color:#334155;margin-bottom:6px;">ยืนยันรหัสผ่านใหม่</label>
            <input id="inviteConfirmPassword" type="password" minlength="10" autocomplete="new-password" required style="width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;margin-bottom:18px;">
            <button id="invitePasswordSubmit" type="submit" style="width:100%;padding:13px 16px;border:0;border-radius:10px;background:var(--primary);color:#fff;font-size:16px;font-weight:800;cursor:pointer;">บันทึกรหัสผ่าน</button>
          </form>
        `}
      </section>
    </main>`;

  if (isError) return;
  document.getElementById('invitePasswordForm')?.addEventListener('submit', async function(event) {
    event.preventDefault();
    const password = document.getElementById('inviteNewPassword')?.value || '';
    const confirmation = document.getElementById('inviteConfirmPassword')?.value || '';
    const message = document.getElementById('invitePasswordMessage');
    const button = document.getElementById('invitePasswordSubmit');
    if (password.length < 10) {
      message.textContent = 'รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร';
      message.style.color = '#b91c1c';
      return;
    }
    if (password !== confirmation) {
      message.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
      message.style.color = '#b91c1c';
      return;
    }
    button.disabled = true;
    button.textContent = 'กำลังบันทึก...';
    try {
      await window.PP5Data.auth.updatePassword(password);
      message.textContent = 'ตั้งรหัสผ่านสำเร็จ กำลังกลับไปหน้าเข้าสู่ระบบ...';
      message.style.color = '#047857';
      await window.PP5Data.auth.signOut();
      history.replaceState(null, '', location.pathname + '?page=login');
      setTimeout(function() { location.replace(location.pathname + '?page=login&password_set=1'); }, 800);
    } catch (error) {
      message.textContent = error?.message || 'ตั้งรหัสผ่านไม่สำเร็จ กรุณาขอลิงก์ใหม่';
      message.style.color = '#b91c1c';
      button.disabled = false;
      button.textContent = 'บันทึกรหัสผ่าน';
    }
  });
}

/* =========================
   APP INITIALIZATION
========================= */
document.addEventListener('DOMContentLoaded', async function() {
  // console.log('🚀 DOMContentLoaded');
  
  if (window.__appInited) {
    // console.log('⚠️ Already initialized');
    return;
  }
  const passwordFlow = getSupabasePasswordFlow_();
  if (passwordFlow) {
    window.__appInited = true;
    let sessionReady = false;
    if (passwordFlow.type !== 'error') {
      try {
        const state = window.__PP5_AUTH_READY ? await window.__PP5_AUTH_READY : null;
        sessionReady = !!state?.session?.user;
      } catch (_) {}
    }
    renderSupabasePasswordSetup_(passwordFlow, sessionReady);
    return;
  }

  // Get page param
  const pageParam = new URLSearchParams(location.search).get('page');
  const isLoginPage = pageParam === 'login';
  const isPublicAuthPage = isLoginPage || pageParam === 'forgot_password';
  document.body.classList.toggle('pp5-public-auth-page', isPublicAuthPage);
  document.body.classList.toggle('pp5-login-page', isLoginPage);
  // console.log('📍 pageParam:', pageParam, 'isLoginPage:', isLoginPage);

  // Supabase restores its persisted session asynchronously. Waiting here
  // prevents a valid session from being redirected before validation ends.
  if (!isPublicAuthPage && window.__PP5_AUTH_READY) {
    try { await window.__PP5_AUTH_READY; }
    catch (_) { window.__authTokenValidated = false; }
  }

  // Validate browser-held sessions before protected content executes. This
  // also clears legacy dev bypass values left behind by older deployments.
  if (!isPublicAuthPage && !window.__authTokenValidated) {
    const hasLocalSession = localStorage.getItem('loggedIn') === 'true' &&
      !!localStorage.getItem('username');
    const authToken = localStorage.getItem('authToken') || '';
    if (!hasLocalSession || !authToken || authToken === 'dev_bypass_token') {
      window.redirectToLogin();
      return;
    }
    if (typeof google === 'undefined' || !google.script || !google.script.run) {
      window.redirectToLogin();
      return;
    }
    showMainLoading();
    google.script.run
      .withSuccessHandler(function(result) {
        if (!result || !result.valid) {
          window.redirectToLogin();
          return;
        }
        window.__authTokenValidated = true;
        document.dispatchEvent(new Event('DOMContentLoaded'));
      })
      .withFailureHandler(function() {
        window.redirectToLogin();
      })
      .validateToken(authToken);
    return;
  }

  window.__appInited = true;

  retireLegacyScoreWarehouseUi_(document);

  // Update mode
  updateMode();
  window.addEventListener('resize', updateMode);

  // Handle login / auth page
  if (isPublicAuthPage) {
    navigateToAuthPage_(pageParam);
    return;
  }

  // Public pages must never elevate access from URL parameters. For the
  // editor-only /dev deployment the server injects its test session.
  const isLoggedIn = localStorage.getItem("loggedIn") === "true";
  const username = localStorage.getItem("username");
  // console.log('🔑 Auth check - loggedIn:', isLoggedIn, 'username:', username);

  // Show sidebar
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.style.display = 'block';

  // Role-based menu visibility
  const role = localStorage.getItem('role') || 'teacher';
  // console.log('👤 Role:', role);
  
  // Remove admin-only if not admin (เจ้าหน้าที่ธุรการใช้รายการหน้าของตัวเองด้านล่างแทน)
  if (role !== 'admin' && role !== 'registrar') {
    document.querySelectorAll('.admin-only').forEach(el => el.remove());
  }
  // เจ้าหน้าที่ธุรการ (registrar, SQL 036): เหลือเฉพาะเมนูงานทะเบียน/ย้ายออก/ดูผล ตาม PP5Permissions.registrarPages
  if (role === 'registrar') {
    const allowed = (window.PP5Permissions && window.PP5Permissions.registrarPages) || ['home_hub', 'change_password', 'help_page'];
    document.querySelectorAll('.nav-item').forEach(function(item) {
      const link = item.querySelector('[data-page], [onclick]');
      const target = item.getAttribute('data-page') || link?.getAttribute('data-page')
        || ((link?.getAttribute('onclick') || '').match(/navigateTo\('([^']+)'\)/) || [])[1] || '';
      if (item.querySelector('#logoutBtn, #logoutLink')) return;
      if (!allowed.includes(target)) item.remove();
    });
    document.querySelectorAll('.menu-group').forEach(function(group) {
      if (!group.querySelector('.nav-item')) group.remove();
    });
  }

  function removeMasterOnly_(){
    document.querySelectorAll('.master-only').forEach(el => el.remove());
  }

  if (role === 'admin') {
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      const token = localStorage.getItem('authToken') || '';
      google.script.run
        .withSuccessHandler(function(res) {
          if (!res || !res.allowExport) removeMasterOnly_();
        })
        .withFailureHandler(function() {
          removeMasterOnly_();
        })
        .getExportCapability(token);
    } else {
      removeMasterOnly_();
    }
  } else {
    removeMasterOnly_();
  }
  
  // Hide teacher-specific menu items for parents
  if (role === 'parent') {
    document.querySelectorAll('.teacher-only').forEach(el => el.remove());
    // Keep only the parent pages (plus logout) in every menu, and drop groups left empty.
    document.querySelectorAll('.nav-item').forEach(function(item) {
      const link = item.querySelector('[data-page], [onclick]');
      const target = item.getAttribute('data-page') || link?.getAttribute('data-page')
        || ((link?.getAttribute('onclick') || '').match(/navigateTo\('([^']+)'\)/) || [])[1] || '';
      if (item.querySelector('#logoutBtn, #logoutLink')) return;
      if (!PARENT_PAGES_.includes(target)) item.remove();
    });
    document.querySelectorAll('.menu-group').forEach(function(group) {
      if (!group.querySelector('.nav-item')) group.remove();
    });
    if (typeof setFavorites_ === 'function') setFavorites_(['parent_portal', 'change_password']);
  }

  // Display user info
  displayUserInfo();

  // Both logout controls are plain links in the shared shell. Bind them here
  // after the authenticated app has initialized so clicks cannot be swallowed
  // by page navigation or leave the browser session active accidentally.
  ['logoutLink', 'logoutBtn'].forEach(function(id) {
    const control = document.getElementById(id);
    if (!control || control.dataset.pp5LogoutBound === '1') return;
    control.dataset.pp5LogoutBound = '1';
    control.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!window.confirm('ต้องการออกจากระบบหรือไม่?')) return;
      window.logout(event);
    });
  });

  // Favorites + quick menu
  attachFavoriteStars_();
  ensureDefaultFavorites_();
  renderMobileQuickMenu_();
  syncFavoriteStars_();

  // Mobile / Touch device: collapse all groups (only at mobile width)
  if (window.innerWidth < 992) {
    document.querySelectorAll('.menu-group').forEach(group => {
      group.classList.add('menu-collapsed');
    });
  }

  // Bind mobile toggle
  const mobileToggle = document.getElementById('mobileSidebarToggle');
  mobileToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMobileSidebar();
  });

  // Bind desktop toggle
  const desktopToggle = document.getElementById('sidebarToggle');
  desktopToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDesktopSidebar();
  });

  // Bind backdrop
  const backdrop = document.getElementById('sidebarBackdrop');
  backdrop?.addEventListener('click', closeMobileSidebar);

  // Bind menu headers
  let activeFlyoutHeader = null;
  document.querySelectorAll('.menu-group').forEach(group => {
    const header = group.querySelector('.menu-header');
    if (header) {
      header.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const directPage = header.getAttribute('data-page');
        if (directPage) {
          closeFlyout();
          activeFlyoutHeader = null;
          closeMobileSidebar();
          navigateTo(directPage);
          return;
        }
        
        // Re-evaluate on every click to handle orientation changes
        const isTouchNow = window.matchMedia('(pointer: coarse)').matches;
        const isWide = window.innerWidth >= 992;

        if (isWide) {
          // Desktop or iPad landscape: flyout
          if (activeFlyoutHeader === header) {
            closeFlyout();
            activeFlyoutHeader = null;
          } else {
            closeFlyout();
            openFlyout(group, header);
            activeFlyoutHeader = header;
          }
        } else {
          // Mobile / iPad portrait: accordion
          closeFlyout();
          activeFlyoutHeader = null;
          toggleAccordion(group);
        }
      });
    }
  });

  // Bind navigation
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.nav-link[data-page]');
    if (!link) return;
    if (link.closest('.menu-header')) return;
    
    const page = link.getAttribute('data-page');
    if (!page) return;
    
    e.preventDefault();
    e.stopPropagation();
    navigateTo(page);
  }, true);

  // Bind outside click for flyout
  document.addEventListener('click', (e) => {
    const flyout = document.getElementById('submenuFlyout');
    if (activeFlyoutHeader && 
        !flyout?.contains(e.target) && 
        !e.target.closest('.menu-header')) {
      closeFlyout();
      activeFlyoutHeader = null;
    }
  });

  // Bind search
  const searchInput = document.getElementById('menuSearch');
  const searchClear = document.getElementById('menuSearchClear');
  searchInput?.addEventListener('input', (e) => {
    handleSearch(e.target.value);
  });

  searchClear?.addEventListener('click', (e) => {
    e.preventDefault();
    if (searchInput) searchInput.value = '';
    handleSearch('');
    closeFlyout();
    searchInput?.focus?.();
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = document.querySelector('.nav-item:not([style*="display: none"]) .nav-link[data-page]');
    const page = first?.getAttribute('data-page');
    if (!page) return;
    e.preventDefault();
    navigateTo(page);
  });

  // Handle popstate
  window.addEventListener('popstate', e => {
    if (e.state?.page) {
      closeFlyout();
      closeMobileSidebar();
      const restoredPage = normalizeRetiredPage_(e.state.page);
      loadPage(restoredPage).then(() => setActivePage(restoredPage));
    }
  });

  // Load first page
  const firstPage = normalizeRetiredPage_(pageParam || 'home_hub');
  // console.log('📄 Loading first page:', firstPage);
  showMainLoading();
  loadPage(firstPage)
    .then(() => { 
      // console.log('✅ First page loaded');
      setActivePage(firstPage); 
      updateURL(firstPage); 
      if (typeof window.checkGlobalAcademicYearWarning === 'function') {
        window.checkGlobalAcademicYearWarning();
      }
    })
    .catch((err) => {
      console.error('❌ First page load error:', err);
      showLoadError(firstPage);
    });

  // console.log('✅ P5Smart v3.0.1 initialized');
});

window.checkGlobalAcademicYearWarning = function() {
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(function(res) {
        const banner = document.getElementById('globalYearWarningBanner');
        const display = document.getElementById('globalYearDisplay');
        if (banner && display) {
          if (res && res.success && res.isEditingOldYear) {
            display.textContent = res.currentYear;
            banner.classList.remove('d-none');
          } else {
            banner.classList.add('d-none');
          }
        }
      })
      .getYearDatabaseRegistry(localStorage.getItem('authToken') || '');
  }
};
  


/**
 * GradeClassHelper
 * - remembers the latest grade/class selection
 * - creates quick grade buttons
 * - loads real classroom numbers from Students via getAvailableClasses()
 * - auto-selects the room when a grade has only one active classroom
 */
window.GradeClassHelper = (function() {
  const STORAGE_KEY = 'lastGradeClass';
  const ROOMS_CACHE = {};
  const ROOMS_LOADING_TEXT = 'กำลังตรวจห้อง...';

  function ensureQuickBarStyles() {
    if (document.getElementById('gcQuickBarStyles')) return;

    const style = document.createElement('style');
    style.id = 'gcQuickBarStyles';
    style.textContent = `
      #gcQuickBar.gc-quick-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: flex-start;
        margin: 2px 0 10px;
      }

      #gcQuickBar .gc-quick-btn {
        position: relative;
        min-width: 68px;
        border: 1px solid color-mix(in srgb, var(--primary-light) 32%, transparent) !important;
        border-radius: 999px !important;
        padding: .44rem .92rem !important;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%) !important;
        color: color-mix(in srgb, var(--primary) 70%, #000) !important;
        font-weight: 700 !important;
        font-size: .9rem !important;
        letter-spacing: .01em;
        line-height: 1.15;
        box-shadow: 0 5px 14px rgba(15, 23, 42, .06);
        transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease, color .16s ease;
      }

      #gcQuickBar .gc-quick-btn:hover,
      #gcQuickBar .gc-quick-btn:focus {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--primary) 58%, transparent) !important;
        background: linear-gradient(180deg, color-mix(in srgb, var(--primary-light) 9%, #fff) 0%, #ffffff 100%) !important;
        color: color-mix(in srgb, var(--primary) 55%, #000) !important;
        box-shadow: 0 10px 22px color-mix(in srgb, var(--primary) 16%, transparent);
      }

      #gcQuickBar .gc-quick-btn.btn-primary,
      #gcQuickBar .gc-quick-btn.is-active {
        border-color: transparent !important;
        background: linear-gradient(135deg, var(--primary) 0%, #2563eb 58%, #06b6d4 100%) !important;
        color: #ffffff !important;
        box-shadow: 0 12px 24px rgba(37, 99, 235, .28);
      }

      #gcQuickBar .gc-quick-btn.btn-primary::after,
      #gcQuickBar .gc-quick-btn.is-active::after {
        content: "";
        position: absolute;
        inset: 2px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, .22);
        pointer-events: none;
      }

      #gcQuickBar .gc-quick-btn.btn-primary:hover,
      #gcQuickBar .gc-quick-btn.is-active:hover,
      #gcQuickBar .gc-quick-btn.btn-primary:focus,
      #gcQuickBar .gc-quick-btn.is-active:focus {
        transform: translateY(-1px);
        color: #fff !important;
        box-shadow: 0 14px 28px rgba(37, 99, 235, .34);
      }

      @media (max-width: 576px) {
        /* มือถือ: ตาราง 3 คอลัมน์ ปุ่มกว้างเท่ากัน ทุกแถวตรงกัน (เดิมเรียง 4 + 2 แถวล่างโหว่) */
        #gcQuickBar.gc-quick-bar { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
        /* นิ้วกดได้สบาย: สูงอย่างน้อย 40px (เดิม ~30px) */
        #gcQuickBar .gc-quick-btn {
          width: 100%;
          min-width: 0;
          min-height: 40px;
          padding: .5rem .8rem !important;
          font-size: .9rem !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getTeacherHomeroomInfo() {
    try {
      const userClass = String(localStorage.getItem('className') || '').trim();
      if (!userClass || userClass === 'ทุกระดับชั้น') return null;
      const gMatch = userClass.match(/(?:ประถมศึกษาปีที่|มัธยมศึกษาปีที่|อนุบาล|ป\.|อ\.|ม\.)\s*([0-9]+)/i) ||
                     userClass.match(/(ป\.[1-6]|อ\.[1-3]|ม\.[1-6])/i);
      let grade = '';
      if (gMatch) {
        if (gMatch[1].includes('.')) {
          grade = gMatch[1];
        } else if (userClass.includes('ป.') || userClass.includes('ประถม')) {
          grade = 'ป.' + gMatch[1];
        } else if (userClass.includes('อ.') || userClass.includes('อนุบาล')) {
          grade = 'อ.' + gMatch[1];
        } else if (userClass.includes('ม.') || userClass.includes('มัธยม')) {
          grade = 'ม.' + gMatch[1];
        }
      }
      const cMatch = userClass.match(/(?:ห้อง|\/)\s*([0-9]+)/);
      const classNo = cMatch ? cMatch[1] : '1';
      return grade ? { grade, classNo } : null;
    } catch(e) {
      return null;
    }
  }

  function saveSelection(grade, classNo) {
    if (!grade) return;
    try {
      const finalClassNo = String(classNo || '1').trim();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ grade, classNo: finalClassNo, ts: Date.now() }));
    } catch(e) {}
  }

  function loadSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.grade) {
          if (!parsed.classNo) parsed.classNo = '1';
          return parsed;
        }
      }
    } catch(e) {}
    const homeroom = getTeacherHomeroomInfo();
    if (homeroom) return homeroom;
    return null;
  }

  function autoSelectClass(classSelectEl, preferredClassNo) {
    if (!classSelectEl || classSelectEl.disabled) return;
    const options = Array.from(classSelectEl.options || []).filter(o => {
      const v = String(o.value || '').trim();
      const t = String(o.textContent || '').trim();
      return v !== '' && !/เลือก|ทั้งหมด|ทุกห้อง|กำลัง|loading/i.test(t);
    });
    if (options.length === 0) return;

    if (classSelectEl.value && options.some(o => o.value === classSelectEl.value)) {
      return;
    }

    const saved = loadSelection();
    const target = String(preferredClassNo || classSelectEl.dataset.gcPreferredClassNo || saved?.classNo || '1').trim();

    let chosen = '';
    if (options.some(o => o.value === target)) {
      chosen = target;
    } else if (options.some(o => o.value === '1')) {
      chosen = '1';
    } else if (options.length === 1) {
      chosen = options[0].value;
    } else if (options.length > 0) {
      chosen = options[0].value;
    }

    if (chosen && classSelectEl.value !== chosen) {
      classSelectEl.value = chosen;
      classSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
      classSelectEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function autoSelectClassIfSingle(classSelectEl) {
    autoSelectClass(classSelectEl);
  }

  function normalizeRooms(result) {
    const raw = Array.isArray(result)
      ? result
      : (result && Array.isArray(result.classes) ? result.classes : []);

    const cleaned = raw.map(v => String(v || '').trim())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));

    return cleaned.length > 0 ? cleaned : ['1'];
  }

  function getPlaceholderLabel(classSelectEl) {
    const first = classSelectEl && classSelectEl.options && classSelectEl.options[0];
    if (first && !first.value && first.textContent !== ROOMS_LOADING_TEXT) return first.textContent;
    return classSelectEl?.dataset?.gcPlaceholder || 'เลือกห้อง';
  }

  function populateRoomOptions(classSelectEl, rooms, preferredClassNo) {
    if (!classSelectEl || !rooms || rooms.length === 0) return false;

    const placeholder = getPlaceholderLabel(classSelectEl);
    const saved = loadSelection();
    const preferred = String(preferredClassNo || classSelectEl.dataset.gcPreferredClassNo || saved?.classNo || classSelectEl.value || '1').trim();
    classSelectEl.innerHTML = '';

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = placeholder;
    classSelectEl.appendChild(blank);

    rooms.forEach(room => {
      const opt = document.createElement('option');
      opt.value = room;
      opt.textContent = room;
      classSelectEl.appendChild(opt);
    });

    const selected = rooms.includes(preferred) ? preferred : (rooms.includes('1') ? '1' : rooms[0]);
    if (selected) {
      classSelectEl.value = selected;
      classSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
      classSelectEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    return true;
  }

  function setRoomsLoading(classSelectEl) {
    if (!classSelectEl) return;
    classSelectEl.dataset.gcPlaceholder = getPlaceholderLabel(classSelectEl);
    classSelectEl.innerHTML = '';

    const loading = document.createElement('option');
    loading.value = '';
    loading.textContent = ROOMS_LOADING_TEXT;
    classSelectEl.appendChild(loading);
    classSelectEl.disabled = true;
  }

  function restoreRoomFallback(classSelectEl) {
    if (!classSelectEl) return;
    classSelectEl.disabled = false;
    const onlyLoading = classSelectEl.options.length === 1 && classSelectEl.options[0].textContent === ROOMS_LOADING_TEXT;
    if (!onlyLoading) return;

    classSelectEl.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = classSelectEl.dataset.gcPlaceholder || 'เลือกห้อง';
    classSelectEl.appendChild(blank);

    ['1'].forEach(room => {
      const opt = document.createElement('option');
      opt.value = room;
      opt.textContent = room;
      classSelectEl.appendChild(opt);
    });

    classSelectEl.value = '1';
    classSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
    classSelectEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function loadRoomsForGrade(gradeSelectEl, classSelectEl, grade, preferredClassNo) {
    if (!gradeSelectEl || !classSelectEl) return;

    const targetGrade = String(grade || gradeSelectEl.value || '').trim();
    if (!targetGrade) return;

    const saved = loadSelection();
    const preferred = String(preferredClassNo || classSelectEl.dataset.gcPreferredClassNo || saved?.classNo || '1').trim();
    delete classSelectEl.dataset.gcPreferredClassNo;

    if (ROOMS_CACHE[targetGrade]) {
      populateRoomOptions(classSelectEl, ROOMS_CACHE[targetGrade], preferred);
      classSelectEl.disabled = false;
      return;
    }

    if (!window.google || !google.script || !google.script.run || typeof google.script.run.getAvailableClasses !== 'function') {
      autoSelectClass(classSelectEl, preferred);
      return;
    }

    setRoomsLoading(classSelectEl);
    google.script.run
      .withSuccessHandler(result => {
        const rooms = normalizeRooms(result);
        classSelectEl.disabled = false;
        if (rooms.length) {
          ROOMS_CACHE[targetGrade] = rooms;
          populateRoomOptions(classSelectEl, rooms, preferred);
        } else {
          restoreRoomFallback(classSelectEl);
          autoSelectClass(classSelectEl, preferred);
        }
      })
      .withFailureHandler(() => {
        restoreRoomFallback(classSelectEl);
        autoSelectClass(classSelectEl, preferred);
      })
      .getAvailableClasses(targetGrade, localStorage.getItem('authToken') || '');
  }

  function createQuickBar(gradeSelectEl, classSelectEl, grades) {
    if (!gradeSelectEl) return;
    ensureQuickBarStyles();
    const quickBarToken = (createQuickBar.__token || 0) + 1;
    createQuickBar.__token = quickBarToken;

    const oldModern = document.getElementById('gcQuickBar');
    const oldLegacy = document.getElementById('gcQB');
    if (oldModern) oldModern.remove();
    if (oldLegacy) oldLegacy.remove();

    const bar = document.createElement('div');
    bar.id = 'gcQuickBar';
    bar.className = 'gc-quick-bar';

    const gradeList = grades || window.PP5Grades?.list?.() || ['ป.1','ป.2','ป.3','ป.4','ป.5','ป.6'];
    // ปุ่มลัดทุกห้องที่มีนักเรียนจริง (เดิมมีแค่ ชั้น/1 — ห้อง 2, 3 … ต้องเลือกจากช่องห้องเอง) ระหว่างรอข้อมูลห้องใช้ ชั้น/1
    const drawButtons = (rooms) => {
      bar.innerHTML = '';
      rooms.forEach(({ grade: g, room }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline-primary btn-sm gc-quick-btn';
        btn.textContent = g + '/' + room;
        btn.dataset.grade = g;
        btn.dataset.classNo = room;
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', () => selectGradeClass(gradeSelectEl, classSelectEl, g, room));
        bar.appendChild(btn);
      });
    };
    drawButtons(gradeList.map((g) => ({ grade: g, room: '1' })));
    loadAllRooms_().then((rooms) => {
      if (createQuickBar.__token !== quickBarToken || !bar.isConnected) return;
      const known = rooms.filter((r) => gradeList.includes(r.grade));
      if (!known.length) return;
      // ชั้นที่ยังไม่มีนักเรียนเลยยังแสดง ชั้น/1 ไว้ให้ครูเลือกได้เหมือนเดิม
      const withEmpty = gradeList.flatMap((g) => { const own = known.filter((r) => r.grade === g); return own.length ? own : [{ grade: g, room: '1' }]; });
      drawButtons(withEmpty);
      highlightQuickBtn(gradeSelectEl.value, String(classSelectEl?.value || '').trim());
    }).catch(() => { /* keep the ชั้น/1 buttons */ });

    const host = document.getElementById('gcQuickBarHost');
    if (host) {
      host.appendChild(bar);
    } else {
    const card = gradeSelectEl.closest('.card') ||
                 gradeSelectEl.closest('.score-entry-controls-row') ||
                 gradeSelectEl.closest('.create-score-row') ||
                 gradeSelectEl.closest('.att-filter-card') ||
                 gradeSelectEl.closest('.pro-toolbar');
    if (card) {
      card.insertBefore(bar, card.firstChild);
    } else {
      const container = gradeSelectEl.closest('.form-group') || gradeSelectEl.parentElement;
      if (container && container.parentElement) container.parentElement.insertBefore(bar, container);
    }
    }
  }

  // ห้องทั้งหมดที่มีนักเรียน (ปีนี้ ตามสิทธิ์ของผู้ใช้) เรียงชั้นแล้วเลขห้อง — ใช้ร่วมกับปุ่มลัดและแผงความคืบหน้าหน้าหลัก
  function loadAllRooms_() {
    const cache = loadAllRooms_.__cache;
    if (cache && Date.now() - cache.at < 60000) return cache.promise;
    const order = (window.PP5Grades?.list?.() || ['ป.1','ป.2','ป.3','ป.4','ป.5','ป.6','ม.1','ม.2','ม.3']);
    const promise = (async () => {
      const students = await window.PP5Data.students.list({});
      const seen = new Map();
      students.forEach((s) => {
        const grade = String(s.grade || '').trim();
        const room = String(s.classNo || s.room || '1').trim();
        if (grade && room) seen.set(grade + '/' + room, { grade, room });
      });
      return [...seen.values()].sort((a, b) => ((order.indexOf(a.grade) + 100) % 100) - ((order.indexOf(b.grade) + 100) % 100)
        || a.room.localeCompare(b.room, 'th', { numeric: true }));
    })();
    loadAllRooms_.__cache = { at: Date.now(), promise };
    promise.catch(() => { loadAllRooms_.__cache = null; });
    return promise;
  }
  window.PP5LoadAllRooms = loadAllRooms_;

  function selectGradeClass(gradeSelectEl, classSelectEl, grade, classNo) {
    if (!gradeSelectEl) return;

    const targetClassNo = String(classNo || '1').trim();
    if (classSelectEl) {
      classSelectEl.dataset.gcPreferredClassNo = targetClassNo;
    }

    gradeSelectEl.value = grade;
    gradeSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
    gradeSelectEl.dispatchEvent(new Event('input', { bubbles: true }));

    if (classSelectEl) {
      const options = Array.from(classSelectEl.options || []);
      if (!options.some(o => o.value === targetClassNo) && targetClassNo) {
        const opt = document.createElement('option');
        opt.value = targetClassNo;
        opt.textContent = targetClassNo;
        classSelectEl.appendChild(opt);
      }
      classSelectEl.value = targetClassNo;
      classSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
      classSelectEl.dispatchEvent(new Event('input', { bubbles: true }));
      saveSelection(grade, targetClassNo);
      highlightQuickBtn(grade, targetClassNo);
    } else {
      saveSelection(grade, targetClassNo);
    }
  }

  function highlightQuickBtn(grade, classNo) {
    document.querySelectorAll('.gc-quick-btn').forEach(b => {
      const active = b.dataset.grade === grade && b.dataset.classNo === classNo;
      b.classList.toggle('btn-primary', active);
      b.classList.toggle('btn-outline-primary', !active);
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function hookChangeEvents(gradeSelectEl, classSelectEl) {
    if (!gradeSelectEl || !classSelectEl) return;
    if (classSelectEl.dataset.gcHelperBound === '1') return;
    classSelectEl.dataset.gcHelperBound = '1';

    const observer = new MutationObserver(() => autoSelectClass(classSelectEl));
    observer.observe(classSelectEl, { childList: true });

    gradeSelectEl.addEventListener('change', () => {
      const saved = loadSelection();
      const preferred = classSelectEl.dataset.gcPreferredClassNo || classSelectEl.value || saved?.classNo || '1';
      saveSelection(gradeSelectEl.value, preferred);
      autoSelectClass(classSelectEl, preferred);
      loadRoomsForGrade(gradeSelectEl, classSelectEl, gradeSelectEl.value, preferred);
    }, true);

    gradeSelectEl.addEventListener('change', () => {
      const saved = loadSelection();
      const preferred = classSelectEl.value || saved?.classNo || '1';
      saveSelection(gradeSelectEl.value, preferred);
      setTimeout(() => autoSelectClass(classSelectEl, preferred), 80);
    });

    classSelectEl.addEventListener('change', () => {
      const grade = gradeSelectEl.value;
      const classNo = classSelectEl.value || '1';
      if (grade) {
        saveSelection(grade, classNo);
        highlightQuickBtn(grade, classNo);
      }
    });
  }

  function init(options) {
    const opts = options || {};
    const gradeId = opts.gradeId || 'gradeSelect';
    const classId = opts.classId || 'classSelect';
    const grades = opts.grades || null;
    const noQuickBar = opts.noQuickBar || false;
    const autoRestore = opts.autoRestore !== false;

    const gradeEl = document.getElementById(gradeId);
    const classEl = document.getElementById(classId);
    if (!gradeEl) return;
    try { window.PP5Grades?.patchSelect?.(gradeEl); } catch (_) { /* grade-levels.js not loaded */ }

    hookChangeEvents(gradeEl, classEl);

    if (!noQuickBar) createQuickBar(gradeEl, classEl, grades);

    if (autoRestore) {
      const last = loadSelection();
      const targetGrade = last?.grade || gradeEl.value || 'ป.1';
      const targetClass = last?.classNo || '1';

      if (!gradeEl.value && targetGrade) {
        selectGradeClass(gradeEl, classEl, targetGrade, targetClass);
      } else {
        if (classEl && (!classEl.value || classEl.value === '')) {
          autoSelectClass(classEl, targetClass);
        }
        highlightQuickBtn(gradeEl.value, classEl ? classEl.value : '1');
      }
    } else if (classEl && (!classEl.value || classEl.value === '')) {
      autoSelectClass(classEl, '1');
    }
  }

  return {
    init,
    selectGradeClass,
    saveSelection,
    loadSelection,
    autoSelectClass,
    autoSelectClassIfSingle,
    loadRoomsForGrade
  };
})();
function enhanceSupabaseReportCardGeneratorPage_(withScores) {
  const frame = document.getElementById('contentFrame');
  if (!frame) return;

  function injectFormatAndTermSelector() {
    const termSelect = frame.querySelector('#termSelector');
    if (!termSelect) return;

    // "พิมพ์ ปพ.6 แบบมีคะแนน": gas-bridge reads this flag when it builds the PDF (คะแนนที่ได้ instead of หมายเหตุ)
    if (withScores && !frame.querySelector('#pp6ScoreModeFlag')) {
      termSelect.insertAdjacentHTML('afterend', '<input type="hidden" id="pp6ScoreModeFlag" value="1">');
    }

    // จอคอม: หน้ากว้างขึ้นและรายชื่อเป็นตารางหลายคอลัมน์ เห็นทั้งห้องโดยไม่ต้องเลื่อน (css .pp6-print-page)
    const pageWrap = frame.querySelector('.page-wrap');
    if (pageWrap && !pageWrap.classList.contains('pp6-print-page')) pageWrap.classList.add('pp6-print-page');
    // สวิตช์ในแถบล่างขวาเดิมไม่มีชื่อ: บอกว่าคือ "แสดงอันดับ"
    const rankToggle = frame.querySelector('.fab-toggle');
    if (rankToggle && !rankToggle.querySelector('.pp6-rank-label')) {
      rankToggle.insertAdjacentHTML('beforeend', '<label for="showRankToggle" class="pp6-rank-label">แสดงอันดับ</label>');
    }

    if (!termSelect.querySelector('option[value="year"]')) {
      const optYear = document.createElement('option');
      optYear.value = 'year';
      optYear.textContent = 'ตลอดปีการศึกษา (รวม 2 ภาคเรียน)';
      termSelect.appendChild(optYear);

      const savedTerm = localStorage.getItem('pp6_report_term') || 'year';
      termSelect.value = savedTerm;
      termSelect.addEventListener('change', (e) => {
        localStorage.setItem('pp6_report_term', e.target.value);
      });
    }

    // ชั้น ม. ตัดสินผลรายภาค (owner 2026-10-11): ปพ.6 พิมพ์ได้เฉพาะภาค 1 / ภาค 2 ซ่อน "ตลอดปีการศึกษา" เมื่อเลือกห้อง ม.
    // ห้องที่เลือกคือปุ่ม .chip.active (data-grade) ของหน้านี้ ดูการเปลี่ยน class แทนการดักทุกทางที่หน้าเลือกห้องได้
    const syncYearOption = () => {
      const optYear = termSelect.querySelector('option[value="year"]');
      if (!optYear) return;
      const lowerSecondary = /^ม\./.test(frame.querySelector('.chip.active')?.dataset?.grade || '');
      if (optYear.hidden !== lowerSecondary) { optYear.hidden = lowerSecondary; optYear.disabled = lowerSecondary; }
      // ม. never gets the "ผลระหว่างปี" watermark (gas-bridge interimWatermarkOn_), so its switch is hidden too
      const interim = frame.querySelector('#pp6InterimWrapper');
      // (inline display:flex would override the hidden attribute)
      if (interim) interim.style.display = lowerSecondary ? 'none' : 'flex';
      if (lowerSecondary && termSelect.value === 'year') {
        termSelect.value = '1';
        // same path as a user change: remembered term + watermark label follow
        termSelect.dispatchEvent(new Event('change'));
      }
    };
    if (!termSelect.dataset.pp6YearSync) {
      termSelect.dataset.pp6YearSync = '1';
      // #contentFrame stays across pages: keep a single observer for the current page's selector
      frame._pp6YearObserver?.disconnect();
      frame._pp6YearObserver = new MutationObserver(syncYearOption);
      frame._pp6YearObserver.observe(frame, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    syncYearOption();

    const termContainer = termSelect.parentElement;
    if (!termContainer || frame.querySelector('#pp6HeaderFormatWrapper')) return;

    const savedFormat = localStorage.getItem('pp6_report_format') || 'single';

    const wrapper = document.createElement('div');
    wrapper.id = 'pp6HeaderFormatWrapper';
    wrapper.style.cssText = 'display:flex;align-items:center;gap:6px;margin-right:12px;';
    wrapper.innerHTML = `
      <label for="pp6ReportFormatSelector" style="font-size:.85rem;color:var(--primary);font-weight:600;white-space:nowrap;"><i class="fa-solid fa-book-open"></i> รูปแบบ:</label>
      <select id="pp6ReportFormatSelector" style="padding:4px 10px;border:1.5px solid var(--primary-light);border-radius:8px;font-size:.85rem;background:#fff;color:color-mix(in srgb, var(--primary) 70%, #000);font-weight:700;cursor:pointer;box-shadow:0 1px 3px color-mix(in srgb, var(--primary-light) 15%, transparent);">
        <option value="single" ${savedFormat === 'single' ? 'selected' : ''}>📄 แบบใบสรุป (1 หน้า)</option>
        <option value="booklet" ${savedFormat === 'booklet' ? 'selected' : ''}>📖 แบบเล่ม ปพ.6 (4 หน้า)</option>
      </select>
    `;

    termContainer.insertBefore(wrapper, termContainer.firstChild);
    // บนมือถือแถวนี้ไม่ตัดบรรทัด ทำให้ช่อง "รูปแบบ" ล้นออกนอกจอ: ให้ CSS จัดเป็นแถวใหม่ได้
    termContainer.classList.add('pp6-report-controls');
    termContainer.closest('.step-header')?.classList.add('pp6-report-header');

    const selectEl = wrapper.querySelector('#pp6ReportFormatSelector');
    if (selectEl) {
      selectEl.addEventListener('change', (e) => {
        localStorage.setItem('pp6_report_format', e.target.value);
      });
    }

    const oldFab = frame.querySelector('#pp6FormatSelectWrapper');
    if (oldFab) oldFab.remove();

    // สวิตช์ลายน้ำเฉพาะการพิมพ์ครั้งนี้ (ค่าเริ่มต้นตามสวิตช์ของโรงเรียนในหน้าตั้งค่า ไม่บันทึกกลับ)
    // เปิด = ลายน้ำ "ผลระหว่างปี" (ภาค 1/2) และ "ฉบับร่าง" เมื่อข้อมูลไม่ครบ/รออนุมัติ  ปิด = ไม่มีลายน้ำเลย
    // แสดงทุกภาคเรียน (ตลอดปีมีได้แค่ฉบับร่าง)  gas-bridge อ่าน #pp6InterimToggle ตอนสร้าง PDF
    if (!frame.querySelector('#pp6InterimWrapper')) {
      const interim = document.createElement('label');
      interim.id = 'pp6InterimWrapper';
      interim.title = 'เปิด: ใส่ลายน้ำ "ผลระหว่างปี — ตัดสินผลการเรียนเป็นรายปี" (ภาคเรียน 1/2) และลายน้ำ "ฉบับร่าง" เมื่อข้อมูลยังไม่ครบหรือรออนุมัติ · ปิด: ไม่มีลายน้ำ';
      interim.style.cssText = 'display:flex;align-items:center;gap:6px;margin:0 0 0 10px;padding:3px 10px;border:1px solid rgba(245,158,11,.55);background:rgba(245,158,11,.1);border-radius:999px;font-size:.8rem;font-weight:600;color:#92400e;white-space:nowrap;cursor:pointer;';
      interim.innerHTML = '<span class="form-check form-switch m-0" style="min-height:0;padding-left:2.2em"><input class="form-check-input" type="checkbox" role="switch" id="pp6InterimToggle" checked style="cursor:pointer"></span><span data-label>ลายน้ำ</span>';
      termContainer.appendChild(interim);
      const toggle = interim.querySelector('#pp6InterimToggle');
      const syncInterim = () => {
        const label = interim.querySelector('[data-label]');
        if (label) label.textContent = termSelect.value === 'year' ? 'ลายน้ำ: ฉบับร่าง' : 'ลายน้ำ: ผลระหว่างปี / ฉบับร่าง';
      };
      termSelect.addEventListener('change', syncInterim);
      syncInterim();
      window.PP5Data?.settings?.get?.().then((settings) => {
        if (!toggle.dataset.touched) toggle.checked = settings?.interimWatermark !== false;
      }).catch(() => {});
      toggle.addEventListener('change', () => { toggle.dataset.touched = '1'; });
      // the switch is created after the first sync: apply the ม. rule to it now
      syncYearOption();
    }

    // สวิตช์ลายเซ็นเฉพาะการพิมพ์ครั้งนี้ (ลายเซ็น ผอ. / วิชาการ / ครูประจำชั้น และตราประทับ ทั้งปกและหน้าผลการเรียน)
    // ค่าเริ่มต้นตามหน้าตั้งค่าลายเซ็น ไม่บันทึกกลับ  gas-bridge อ่าน #pp6SignatureToggle ตอนสร้าง PDF (owner 2026-10-18)
    if (!frame.querySelector('#pp6SignatureWrapper')) {
      const sign = document.createElement('label');
      sign.id = 'pp6SignatureWrapper';
      sign.title = 'เปิด: ใส่ลายเซ็น ผอ. หัวหน้าวิชาการ ครูประจำชั้น และตราประทับ ตามที่บันทึกไว้ในหน้าตั้งค่าลายเซ็น · ปิด: เว้นช่องให้ลงชื่อด้วยมือ';
      sign.style.cssText = 'display:flex;align-items:center;gap:6px;margin:0 0 0 10px;padding:3px 10px;border:1px solid rgba(37,99,235,.45);background:rgba(37,99,235,.08);border-radius:999px;font-size:.8rem;font-weight:600;color:#1e40af;white-space:nowrap;cursor:pointer;';
      sign.innerHTML = '<span class="form-check form-switch m-0" style="min-height:0;padding-left:2.2em"><input class="form-check-input" type="checkbox" role="switch" id="pp6SignatureToggle" checked style="cursor:pointer"></span><span>ลายเซ็น ผอ. / ตรา</span>';
      termContainer.appendChild(sign);
      const signToggle = sign.querySelector('#pp6SignatureToggle');
      signToggle.addEventListener('change', () => { signToggle.dataset.touched = '1'; });
      if (typeof google !== 'undefined' && google.script?.run) {
        google.script.run
          .withSuccessHandler((sigs) => { if (sigs && !signToggle.dataset.touched) signToggle.checked = sigs.includeSignatures !== false; })
          .withFailureHandler(() => {})
          .getSchoolSignatures();
      }
    }
  }

  injectFormatAndTermSelector();
  setTimeout(injectFormatAndTermSelector, 100);
  setTimeout(injectFormatAndTermSelector, 300);
  setTimeout(injectFormatAndTermSelector, 700);
}



function showRollbackConfirmationModal_(transitionId, fromYear, toYear, onComplete, expectedRevision) {
  const modalId = 'pp5V2RollbackConfirmModal';
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();

  const expectedToken = `CONFIRM_ROLLBACK_${fromYear}_TO_${toYear}`;
  const modalEl = document.createElement('div');
  modalEl.id = modalId;
  modalEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999999;font-family:Sarabun,sans-serif;';
  modalEl.innerHTML = `
    <div style="background:#fff;border-radius:16px;max-width:550px;width:92%;padding:24px;box-shadow:0 20px 40px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
      <div class="d-flex align-items-center gap-2 mb-2 text-danger">
        <i class="bi bi-arrow-counterclockwise fs-2 text-danger"></i>
        <h4 class="mb-0 fw-bold">ยืนยันย้อนกลับปีการศึกษา (Rollback)</h4>
      </div>
      <p class="text-muted small">
        ระบบจะยกเลิกการเลื่อนชั้น ดึงปีการศึกษากลับมาเป็น ${fromYear} และย้ายระดับชั้นนักเรียนทุกคนกลับมาที่เดิม 100%
      </p>

      <div class="p-3 mb-3 rounded" style="background:#fef2f2;border:1px solid #fecaca;font-size:0.9rem;">
        <div class="fw-bold text-danger mb-1">ผลกระทบที่จะเกิดขึ้นเมื่อกดย้อนกลับ:</div>
        <ul class="mb-0 ps-3 small text-secondary">
          <li>ปีการศึกษาปัจจุบันของโรงเรียนจะกลับเป็น <strong>${fromYear}</strong></li>
          <li>ปลดล็อกปี ${fromYear} ให้กลับมาเขียน/แก้ไขข้อมูลได้ตามปกติ</li>
          <li>นักเรียนที่เลื่อนชั้นขึ้นไปจะถูกปรับระดับชั้นกลับมาเป็นชั้นเดิมของปี ${fromYear}</li>
          <li>นักเรียน ป.6 ที่ถูกตั้งสถานะจบการศึกษา จะกลับมาเป็นนักเรียนปกติของปี ${fromYear}</li>
          <li>ลบทะเบียนนักเรียนของปี ${toYear} ที่สร้างขึ้นโดยการเลื่อนชั้นนี้ออก</li>
        </ul>
      </div>

      <div class="mb-3">
        <label for="v2RollbackTokenInput" class="form-label small fw-bold text-danger">
          เพื่อความปลอดภัย กรุณาพิมพ์รหัสยืนยันด้านล่างนี้ลงในช่อง:
        </label>
        <div class="p-2 mb-2 bg-light border rounded text-center font-monospace fw-bold user-select-all" style="letter-spacing:1px;font-size:0.95rem;">
          ${expectedToken}
        </div>
        <input type="text" id="v2RollbackTokenInput" class="form-control text-center font-monospace" placeholder="พิมพ์ข้อความยืนยันที่นี่">
      </div>

      <div id="v2RollbackModalStatus" class="mb-3" style="display:none;"></div>

      <div class="d-flex justify-content-end gap-2">
        <button type="button" id="v2BtnRollbackCancel" class="btn btn-secondary btn-sm">ยกเลิก</button>
        <button type="button" id="v2BtnRollbackConfirm" class="btn btn-danger btn-sm" disabled>
          <i class="bi bi-arrow-counterclockwise me-1"></i>ยืนยันย้อนกลับทันที
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  const tokenInput = document.getElementById('v2RollbackTokenInput');
  const btnConfirm = document.getElementById('v2BtnRollbackConfirm');
  const btnCancel = document.getElementById('v2BtnRollbackCancel');
  const statusBox = document.getElementById('v2RollbackModalStatus');

  tokenInput.addEventListener('input', () => {
    btnConfirm.disabled = (tokenInput.value.trim() !== expectedToken);
  });

  btnCancel.addEventListener('click', () => {
    modalEl.remove();
  });

  btnConfirm.addEventListener('click', () => {
    btnConfirm.disabled = true;
    btnCancel.disabled = true;
    tokenInput.disabled = true;
    btnConfirm.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังดำเนินการย้อนกลับ...';

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.innerHTML = '<div class="alert alert-info py-2 small mb-0"><span class="spinner-border spinner-border-sm me-2"></span>ระบบกำลังย้ายนักเรียนกลับ ปลดล็อกปีเดิม และคืนค่าระบบ...</div>';
    }

    google.script.run
      .withSuccessHandler((res) => {
        if (!res || !res.success) {
          btnConfirm.disabled = false;
          btnCancel.disabled = false;
          tokenInput.disabled = false;
          btnConfirm.innerHTML = '<i class="bi bi-arrow-counterclockwise me-1"></i>ยืนยันย้อนกลับทันที';
          if (statusBox) {
            statusBox.innerHTML = `<div class="alert alert-danger py-2 small mb-0">❌ ย้อนกลับไม่สำเร็จ: ${res?.message || 'ไม่ทราบสาเหตุ'}</div>`;
          }
          return;
        }

        if (statusBox) {
          statusBox.innerHTML = `<div class="alert alert-success py-2 small mb-0">🎉 ย้อนกลับสู่ปีการศึกษา ${fromYear} สำเร็จเรียบร้อยแล้ว!</div>`;
        }

        setTimeout(() => {
          modalEl.remove();
          alert(`🎉 ยินดีด้วยครับ! ย้อนกลับสู่ปีการศึกษา ${fromYear} สำเร็จสมบูรณ์แล้ว\nระบบจะรีเฟรชการตั้งค่าใหม่`);
          window.location.reload();
        }, 1500);
      })
      .withFailureHandler((err) => {
        btnConfirm.disabled = false;
        btnCancel.disabled = false;
        tokenInput.disabled = false;
        btnConfirm.innerHTML = '<i class="bi bi-arrow-counterclockwise me-1"></i>ยืนยันย้อนกลับทันที';
        if (statusBox) {
          statusBox.innerHTML = `<div class="alert alert-danger py-2 small mb-0">❌ เกิดข้อผิดพลาด: ${err?.message || err}</div>`;
        }
      })
      .rollbackTransitionV2(transitionId, expectedRevision || '', expectedToken);
  });
}

// Parent QR cards. The QR holds ONLY the school's public parent-portal link — never a
// username or password — so a lost card gives nobody access. A card may print the
// username, and the password only right after the admin issued it (same as the slip).
const PARENT_QR_LIB_URL_ = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
let parentQrLibPromise_ = null;
function loadParentQrLib_() {
  if (typeof window.qrcode === 'function') return Promise.resolve(window.qrcode);
  if (!parentQrLibPromise_) {
    parentQrLibPromise_ = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PARENT_QR_LIB_URL_;
      script.onload = () => (typeof window.qrcode === 'function' ? resolve(window.qrcode) : reject(new Error('โหลดตัวสร้าง QR ไม่สำเร็จ')));
      script.onerror = () => { parentQrLibPromise_ = null; reject(new Error('โหลดตัวสร้าง QR ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่')); };
      document.head.appendChild(script);
    });
  }
  return parentQrLibPromise_;
}

function parentQrSvg_(qrcodeLib, url) {
  const qr = qrcodeLib(0, 'M');
  qr.addData(String(url));
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

// cards: [{ fullName, grade, classNo, studentNumber, username, password? }]
function parentQrCardsHtml_(cards, options) {
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const school = options.schoolName ? `<div class="school">${esc(options.schoolName)}</div>` : '';
  const body = cards.map((card) => {
    const room = card.grade ? `ชั้น ${esc(card.grade)}${card.classNo ? '/' + esc(card.classNo) : ''}${card.studentNumber ? ' เลขที่ ' + esc(card.studentNumber) : ''}` : '';
    const password = card.password
      ? `<div class="cred">รหัสผ่าน: <b>${esc(card.password)}</b></div>`
      : '<div class="cred muted">รหัสผ่าน: ตามที่โรงเรียนแจ้ง (ลืมรหัส ติดต่อครูประจำชั้น)</div>';
    return `<div class="card">${school}<div class="qr">${options.svg}</div><div class="info">`
      + '<div class="title">สแกนเพื่อดูผลการเรียน</div>'
      + `<div class="name">ผู้ปกครองของ ${esc(card.fullName)}</div><div class="muted">${room}</div>`
      + (card.username ? `<div class="cred">ชื่อผู้ใช้: <b>${esc(card.username)}</b></div>` : '')
      + password
      + `<div class="url">${esc(options.url)}</div>`
      + '<div class="note">เก็บเป็นความลับ ไม่ส่งต่อให้ผู้อื่น</div></div></div>';
  }).join('');
  return '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>บัตร QR ผู้ปกครอง</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">'
    + '<style>@page{size:A4;margin:10mm}body{font-family:Sarabun,sans-serif;margin:0;color:#111}'
    + '.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}'
    + '.card{border:1px dashed #888;border-radius:3mm;padding:4mm;display:grid;grid-template-columns:34mm 1fr;gap:4mm;align-items:center;page-break-inside:avoid;break-inside:avoid;min-height:58mm;box-sizing:border-box}'
    + '.school{grid-column:1/-1;font-weight:700;font-size:13px;border-bottom:1px solid #ddd;padding-bottom:1.5mm}'
    + '.qr svg{width:34mm;height:34mm;display:block}.title{font-weight:700;font-size:15px}.name{font-size:14px;font-weight:600;margin-top:1mm}'
    + '.cred{font-size:13px;margin-top:1.5mm}.muted{color:#555;font-size:12px}.url{font-size:10px;color:#333;margin-top:2mm;word-break:break-all}'
    + '.note{font-size:10px;color:#a00;margin-top:1mm}</style></head>'
    + `<body><div class="grid">${body}</div></body></html>`;
}

async function printParentQrCards_(cards, url) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัปแล้วลองใหม่');
  win.document.write('<p style="font-family:sans-serif">กำลังสร้างบัตร QR...</p>');
  try {
    const qrcodeLib = await loadParentQrLib_();
    let schoolName = '';
    try { schoolName = String((await window.PP5Data?.settings?.get?.())?.schoolName || ''); } catch (_) { schoolName = ''; }
    win.document.open();
    win.document.write(parentQrCardsHtml_(cards, { url, svg: parentQrSvg_(qrcodeLib, url), schoolName }));
    win.document.close();
    win.focus();
    // Give the Thai web font a moment so the printout does not fall back to a system font.
    setTimeout(() => win.print(), 600);
  } catch (error) {
    win.close();
    throw error;
  }
}

function enhanceSupabaseParentPortalPage_() {
  const frame = document.getElementById('contentFrame');
  if (!frame || frame.querySelector('#pp5ParentSemesterReportEnhancement')) return;
  if (typeof window.openModal !== 'function' || typeof window.loadingHtml !== 'function') return;

  const marker = document.createElement('span');
  marker.id = 'pp5ParentSemesterReportEnhancement';
  marker.hidden = true;
  frame.appendChild(marker);

  // The page staggers each student card by 80 ms with fill-mode "both", so with a
  // whole-school list the last cards (ป.6) stayed invisible for ~8 seconds and
  // looked missing. Cap the stagger at the 10th card.
  const cardDelayCap = document.createElement('style');
  cardDelayCap.textContent = '#studentsContainer .s-card:nth-child(n+11){animation-delay:.8s !important;}';
  frame.appendChild(cardDelayCap);

  // "ความประพฤติ" button on each child card (js/behavior.js). The page re-renders the cards,
  // so watch the container; behavior.js adds nothing until its table exists.
  const studentsContainer = frame.querySelector('#studentsContainer');
  if (studentsContainer && window.PP5Behavior?.enhanceParentCards) {
    const addBehaviorButtons = () => { window.PP5Behavior.enhanceParentCards(studentsContainer).catch(() => {}); };
    new MutationObserver(addBehaviorButtons).observe(studentsContainer, { childList: true });
    addBehaviorButtons();
  }

  // Admin only: hand parents their login through LINE. Creates the missing
  // parent accounts (username = student id) or sets a new password, then
  // shows each message once, ready to copy into a private LINE chat.
  if (String(localStorage.getItem('role') || '').toLowerCase() === 'admin') {
    const accessCard = document.createElement('div');
    accessCard.id = 'pp5ParentAccess';
    accessCard.className = 'search-panel';
    accessCard.style.marginTop = '16px';
    accessCard.innerHTML =
      '<div class="search-panel-header"><span class="badge-audit"><i class="bi bi-line"></i> ส่งลิงก์ให้ผู้ปกครอง</span>' +
      '<span class="search-panel-sub">สร้างบัญชี/ออกรหัสผ่านใหม่ แล้วคัดลอกข้อความไปส่งในแชท LINE ส่วนตัวของผู้ปกครอง</span></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">' +
      '<select id="pp5AccessGrade" class="form-select" style="max-width:180px"><option value="">ทุกชั้น</option></select>' +
      '<button type="button" class="btn btn-outline-primary" id="pp5AccessLoad"><i class="bi bi-arrow-clockwise"></i> แสดงรายชื่อ</button>' +
      '</div><div id="pp5AccessList" style="margin-top:12px"></div><div id="pp5AccessResult" style="margin-top:12px"></div>';
    const searchPanel = frame.querySelector('#adminSearchPanel');
    if (searchPanel && searchPanel.parentNode) searchPanel.parentNode.insertBefore(accessCard, searchPanel.nextSibling);
    else frame.appendChild(accessCard);

    const statusLabel_ = { ready: 'มีบัญชี', missing: 'ยังไม่มีบัญชี', inactive: 'บัญชีถูกปิด', conflict: 'ชื่อซ้ำบัญชีครู' };
    // Always hand out the school domain (js/app-config.js siteUrl), even when the admin works from the
    // *.vercel.app deployment URL; no siteUrl = the address in use.
    const portalHost_ = (() => {
      let site = String(window.PP5_CONFIG?.siteUrl || '').trim();
      while (site.slice(-1) === '/') site = site.slice(0, -1);
      return site || window.location.origin;
    })();
    const portalUrl_ = portalHost_ + '/?page=parent_portal&openExternalBrowser=1';
    const lineMessage_ = (row) => [
      'เรียนผู้ปกครองของ ' + row.fullName + ' (' + row.grade + (row.classNo ? '/' + row.classNo : '') + ')',
      'ดูผลการเรียนได้ที่ ' + portalUrl_,
      'ชื่อผู้ใช้: ' + row.username,
      'รหัสผ่าน: ' + row.password,
      'กรุณาเก็บข้อความนี้เป็นความลับ ไม่ส่งต่อให้ผู้อื่น'
    ].join('\n');
    const copyText_ = (value, button) => {
      const done = () => { if (button) { const old = button.textContent; button.textContent = 'คัดลอกแล้ว'; setTimeout(() => { button.textContent = old; }, 1500); } };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done).catch(() => { window.prompt('คัดลอกข้อความนี้', value); });
      } else {
        window.prompt('คัดลอกข้อความนี้', value);
      }
    };
    const listEl = accessCard.querySelector('#pp5AccessList');
    const resultEl = accessCard.querySelector('#pp5AccessResult');
    const gradeEl = accessCard.querySelector('#pp5AccessGrade');

    const renderAccessList_ = (rows) => {
      if (!rows.length) { listEl.innerHTML = '<div class="text-muted">ไม่พบนักเรียน</div>'; return; }
      let html = '<div style="overflow-x:auto"><table class="table table-sm align-middle"><thead><tr>' +
        '<th><input type="checkbox" id="pp5AccessAll"></th><th>ชั้น</th><th>เลขที่</th><th style="text-align:left">ชื่อ</th><th>ชื่อผู้ใช้</th><th>สถานะ</th></tr></thead><tbody>';
      rows.forEach((row) => {
        const checkable = row.status !== 'conflict';
        html += '<tr><td>' + (checkable ? '<input type="checkbox" class="pp5AccessPick" value="' + escapeParentText_(row.studentId) + '"' + (row.status === 'missing' ? ' checked' : '') + '>' : '') + '</td>' +
          '<td>' + escapeParentText_(row.grade + (row.classNo ? '/' + row.classNo : '')) + '</td>' +
          '<td>' + escapeParentText_(row.studentNumber) + '</td>' +
          '<td style="text-align:left">' + escapeParentText_(row.fullName) + '</td>' +
          '<td>' + escapeParentText_(row.username) + '</td>' +
          '<td>' + escapeParentText_(statusLabel_[row.status] || row.status) + '</td></tr>';
      });
      html += '</tbody></table></div>' +
        '<label style="display:flex;gap:6px;align-items:center;font-size:13px;margin:6px 0"><input type="checkbox" id="pp5AccessReset"> ' +
        'ออกรหัสผ่านใหม่ให้บัญชีที่มีอยู่แล้วด้วย (รหัสเดิมจะใช้ไม่ได้ทันที)</label>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0"><label for="pp5AccessPassword" style="font-size:13px">รหัสผ่านที่จะตั้ง</label>' +
        '<input type="text" id="pp5AccessPassword" class="form-control" style="max-width:220px" autocomplete="off" placeholder="เว้นว่าง = สุ่มรายคน">' +
        '<span style="font-size:12px;color:var(--gray-500)">ใส่รหัสกลาง (อย่างน้อย 10 ตัว) ถ้าต้องการให้ทุกคนใช้รหัสเดียวกัน</span></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="pp5AccessIssue"><i class="bi bi-key-fill"></i> สร้างบัญชี / ออกรหัสผ่านให้ที่เลือก</button>' +
        '<button type="button" class="btn btn-outline-primary" id="pp5AccessQr"><i class="bi bi-qr-code"></i> พิมพ์บัตร QR ให้ที่เลือก (ไม่มีรหัสผ่าน)</button></div>';
      listEl.innerHTML = html;
      listEl.querySelector('#pp5AccessAll').addEventListener('change', (event) => {
        listEl.querySelectorAll('.pp5AccessPick').forEach((box) => { box.checked = event.target.checked; });
      });
      listEl.querySelector('#pp5AccessIssue').addEventListener('click', issueSelected_);
      listEl.querySelector('#pp5AccessQr').addEventListener('click', () => {
        const picked = new Set(Array.from(listEl.querySelectorAll('.pp5AccessPick:checked')).map((box) => box.value));
        const cards = rows.filter((row) => picked.has(String(row.studentId)) && row.status === 'ready');
        if (!cards.length) { resultEl.innerHTML = parentReportErrorHtml_('เลือกนักเรียนที่ "มีบัญชี" แล้วอย่างน้อย 1 คน — ถ้ายังไม่มีบัญชี ให้กดสร้างบัญชีก่อน แล้วพิมพ์บัตรจากผลที่ได้'); return; }
        resultEl.innerHTML = '';
        printParentQrCards_(cards, portalUrl_).catch((error) => { resultEl.innerHTML = parentReportErrorHtml_(error?.message || error); });
      });
    };

    const loadAccess_ = () => {
      listEl.innerHTML = window.loadingHtml('กำลังโหลดรายชื่อ');
      resultEl.innerHTML = '';
      google.script.run
        .withSuccessHandler((res) => {
          if (gradeEl.options.length <= 1 && res && Array.isArray(res.grades)) {
            res.grades.forEach((g) => { const opt = document.createElement('option'); opt.value = g; opt.textContent = g; gradeEl.appendChild(opt); });
          }
          renderAccessList_((res && res.rows) || []);
        })
        .withFailureHandler((error) => { listEl.innerHTML = parentReportErrorHtml_(error?.message || error); })
        .getParentAccessStatus(gradeEl.value);
    };

    const issueSelected_ = () => {
      const ids = Array.from(listEl.querySelectorAll('.pp5AccessPick:checked')).map((box) => box.value);
      if (!ids.length) { resultEl.innerHTML = parentReportErrorHtml_('กรุณาเลือกนักเรียนอย่างน้อย 1 คน'); return; }
      const resetExisting = !!listEl.querySelector('#pp5AccessReset')?.checked;
      const password = (listEl.querySelector('#pp5AccessPassword')?.value || '').trim();
      if (password && password.length < 10) { resultEl.innerHTML = parentReportErrorHtml_('รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร'); return; }
      if (resetExisting && !window.confirm('รหัสผ่านเดิมของบัญชีที่เลือกจะใช้ไม่ได้ทันที ต้องการออกรหัสผ่านใหม่ให้ ' + ids.length + ' คนหรือไม่?')) return;
      resultEl.innerHTML = window.loadingHtml('กำลังดำเนินการ ' + ids.length + ' คน');
      google.script.run
        .withSuccessHandler((res) => {
          const items = (res && res.results) || [];
          const issued = items.filter((item) => item.ok);
          let html = '<div class="alert alert-warning" style="font-size:13px">รหัสผ่านแสดงครั้งเดียวเท่านั้น คัดลอกหรือพิมพ์เก็บไว้ก่อนปิดหน้านี้</div>';
          if (issued.length) html += '<button type="button" class="btn btn-success btn-sm" id="pp5AccessCopyAll">คัดลอกทั้งหมด</button> ' +
            '<button type="button" class="btn btn-outline-secondary btn-sm" id="pp5AccessPrint"><i class="bi bi-qr-code"></i> พิมพ์บัตร QR</button>';
          html += '<div id="pp5AccessSlips">';
          items.forEach((item, index) => {
            if (item.ok) {
              html += '<div style="border:1px solid var(--gray-200);border-radius:10px;padding:10px;margin-top:8px">' +
                '<pre style="white-space:pre-wrap;margin:0 0 6px;font-family:inherit">' + escapeParentText_(lineMessage_(item)) + '</pre>' +
                '<button type="button" class="btn btn-outline-primary btn-sm" data-copy-index="' + index + '">คัดลอกข้อความ</button></div>';
            } else {
              html += '<div class="text-muted" style="font-size:13px;margin-top:6px">' + escapeParentText_((item.fullName || item.studentId) + ': ' + (item.message || 'ไม่สำเร็จ')) + '</div>';
            }
          });
          html += '</div>';
          resultEl.innerHTML = html;
          resultEl.querySelectorAll('[data-copy-index]').forEach((button) => {
            button.addEventListener('click', () => copyText_(lineMessage_(items[Number(button.dataset.copyIndex)]), button));
          });
          resultEl.querySelector('#pp5AccessCopyAll')?.addEventListener('click', (event) =>
            copyText_(issued.map(lineMessage_).join('\n\n----------\n\n'), event.target));
          resultEl.querySelector('#pp5AccessPrint')?.addEventListener('click', () => {
            printParentQrCards_(issued, portalUrl_).catch((error) => window.alert(error?.message || error));
          });
          loadAccessStatusOnly_();
        })
        .withFailureHandler((error) => { resultEl.innerHTML = parentReportErrorHtml_(error?.message || error); })
        .issueParentCredentials(ids, { resetExisting, password });
    };

    // Refresh the status column after issuing, without clearing the slips.
    const loadAccessStatusOnly_ = () => {
      google.script.run
        .withSuccessHandler((res) => renderAccessList_((res && res.rows) || []))
        .withFailureHandler(() => {})
        .getParentAccessStatus(gradeEl.value);
    };

    accessCard.querySelector('#pp5AccessLoad').addEventListener('click', loadAccess_);
    gradeEl.addEventListener('change', loadAccess_);
  }

  // LINE notifications (js/line-notify.js): parents link/unlink, admin announces results.
  // Hidden until the line-notify Edge Function reports LINE as configured.
  window.PP5Line?.enhanceParentPortal?.(frame)?.catch?.(() => {});

  const escapeParentText_ = (value) => {
    if (typeof window.esc === 'function') return window.esc(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  const parentPortalToken_ = () => {
    if (typeof window.portalToken_ === 'function') return window.portalToken_();
    return localStorage.getItem('authToken') || '';
  };
  const parentReportErrorHtml_ = (message) => {
    if (typeof window.errorHtml === 'function') return window.errorHtml(message);
    return '<div class="alert alert-danger">' + escapeParentText_(message || 'ไม่สามารถสร้างใบรายงานได้') + '</div>';
  };

  // แปลงหน้า PDF (data:/blob:/https) เป็นรูปภาพ <img> ใส่ใน container  ใช้ pdf.js จาก cdnjs โหลดเมื่อต้องใช้ครั้งแรก
  // <img> แสดงได้ในเบราว์เซอร์ในแอป (LINE) และกดค้างเพื่อบันทึกรูปได้ ต่างจาก <canvas>/<embed>
  // โหลด pdf.js ไม่ได้ (ออฟไลน์/ถูกบล็อก) = กลับไปแสดงแบบ <embed> เดิม
  const PDFJS_BASE_ = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let pdfjsPromise_ = null;
  const loadPdfJs_ = () => {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsPromise_) return pdfjsPromise_;
    pdfjsPromise_ = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDFJS_BASE_ + 'pdf.min.js';
      script.onload = () => {
        if (!window.pdfjsLib) { reject(new Error('pdf.js ไม่พร้อม')); return; }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE_ + 'pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      script.onerror = () => { pdfjsPromise_ = null; reject(new Error('โหลด pdf.js ไม่สำเร็จ')); };
      document.head.appendChild(script);
    });
    return pdfjsPromise_;
  };
  const pdfBytes_ = async (url) => {
    const value = String(url || '');
    const comma = value.indexOf(',');
    if (/^data:application\/pdf/i.test(value) && comma > 0) {
      const binary = atob(value.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    const response = await fetch(value);
    return new Uint8Array(await response.arrayBuffer());
  };
  window.renderPdfAsImages_ = async function renderPdfAsImages_(container, url, title) {
    if (!container) return;
    try {
      const pdfjs = await loadPdfJs_();
      const pdf = await pdfjs.getDocument({ data: await pdfBytes_(url) }).promise;
      const width = Math.max(320, container.clientWidth || 360);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const images = [];
      for (let n = 1; n <= pdf.numPages; n += 1) {
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        // คมพอซูมอ่านบนมือถือ แต่ไม่ใหญ่จนเปลืองหน่วยความจำ (กว้างไม่เกิน ~1600 px)
        const scale = Math.min(1600 / base.width, Math.max(2.2, (width * dpr * 1.2) / base.width));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/jpeg', 0.92);
        img.alt = 'ใบรายงาน' + (title ? ' ' + title : '') + (pdf.numPages > 1 ? ' หน้า ' + n : '');
        img.style.cssText = 'display:block;width:100%;height:auto;border-radius:6px;background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.12)';
        images.push(img);
      }
      if (!container.isConnected) return;
      container.innerHTML = '';
      images.forEach((img) => container.appendChild(img));
    } catch (error) {
      console.warn('report preview as images failed, falling back to embed', error);
      if (!container.isConnected) return;
      container.innerHTML = '';
      const embed = document.createElement('embed');
      embed.type = 'application/pdf';
      embed.src = url;
      embed.style.cssText = 'width:100%;height:68vh;border:0;border-radius:8px;background:#f3f4f6';
      container.appendChild(embed);
    }
  };

  window.createParentReportCard = function createParentReportCard(studentId, studentName, term) {
    const normalizedTerm = ['1', '2', 'year'].includes(String(term)) ? String(term) : 'year';
    const label = normalizedTerm === '1' ? 'ภาคเรียนที่ 1' : (normalizedTerm === '2' ? 'ภาคเรียนที่ 2' : 'ประจำปี');
    window.openModal(
      'ใบรายงานผล ' + label,
      window.loadingHtml('กำลังสร้างใบรายงาน<br><span style="font-size:12px;color:var(--gray-500)">อาจใช้เวลา 10-30 วินาที</span>')
    );

    google.script.run
      .withSuccessHandler(function(result) {
        const viewUrl = result && (result.viewUrl || result.url || result.downloadUrl);
        if (result && result.success && viewUrl) {
          // แสดงใบรายงานเป็น "รูปภาพ" ของแต่ละหน้า PDF (owner 2026-10-07: ผู้ปกครองเปิดใน LINE แล้วเห็นกล่องว่าง)
          // เบราว์เซอร์ในแอป LINE (โดยเฉพาะ Android) แสดง PDF ใน <embed> ไม่ได้ และดาวน์โหลดไฟล์ที่สร้างในหน้าเว็บไม่ได้
          // แต่รูปภาพแสดงได้ทุกที่ และกดค้างเพื่อบันทึกรูปได้  ปุ่มดาวน์โหลด PDF ยังอยู่สำหรับ Chrome/Safari/คอม
          // ใน LINE มีปุ่ม "เปิดในเบราว์เซอร์ปกติ" (openExternalBrowser=1 ให้ LINE เปิดด้วย Chrome/Safari)
          const fileName = 'report_' + String(studentId).replace(/[^\w-]/g, '') + '_' + normalizedTerm + '.pdf';
          const safeUrl = escapeParentText_(viewUrl);
          const inLine = /\bLine\//i.test(navigator.userAgent || '');
          const externalUrl = window.location.origin + '/?page=parent_portal&openExternalBrowser=1';
          const btn = 'display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px';
          let html = '<div style="display:grid;gap:10px">';
          html += '<div id="pp5ReportPages" style="display:grid;gap:10px;max-height:70vh;overflow:auto;padding:6px;border:1px solid var(--gray-200);border-radius:10px;background:#f3f4f6">'
            + '<div style="padding:28px 12px;text-align:center;color:var(--gray-500);font-size:14px"><span class="spinner-border spinner-border-sm me-2"></span>กำลังเตรียมภาพใบรายงาน...</div></div>';
          html += '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">';
          if (inLine) {
            // LINE (Android) ดาวน์โหลด/บันทึกรูปจากหน้าเว็บไม่ได้: อัปโหลดไฟล์ชั่วคราวแล้วให้ LINE เปิดลิงก์ด้วย Chrome
            // (owner ทดสอบแล้วว่า openExternalBrowser=1 เด้งไป Chrome ได้บน Android) ไม่ต้องล็อกอินใหม่
            html += '<button type="button" id="pp5ReportOpenChrome" style="' + btn + ';border:0;background:#06c755;color:#fff;cursor:pointer"><i class="bi bi-file-earmark-pdf-fill"></i><span>เปิดไฟล์ PDF ใน Chrome</span></button>';
            html += '<a href="' + escapeParentText_(externalUrl) + '" rel="noopener" style="' + btn + ';background:#fff;color:#047857;border:1.5px solid #06c755"><i class="bi bi-box-arrow-up-right"></i>เปิดในเบราว์เซอร์ปกติ</a>';
          } else {
            html += '<a href="' + safeUrl + '" download="' + escapeParentText_(fileName) + '" rel="noopener" style="' + btn + ';background:var(--primary);color:#fff"><i class="bi bi-download"></i>ดาวน์โหลด PDF</a>';
          }
          html += '</div>';
          html += '<p id="pp5ReportNote" style="color:var(--gray-500);font-size:12.5px;text-align:center;margin:2px 0 0;line-height:1.6">ใบรายงาน' + label + 'ของ ' + escapeParentText_(studentName) + '<br>'
            + (inLine
              ? '📌 ต้องการเก็บไฟล์: กด <b>"เปิดไฟล์ PDF ใน Chrome"</b> แล้วบันทึก/แชร์จาก Chrome (ไม่ต้องเข้าสู่ระบบใหม่) หรือแคปหน้าจอ'
                + '<br>(ถ้าปุ่มไม่ทำงาน ให้กดจุดสามจุด ⋮ มุมขวาบน แล้วเลือก "เปิดใน Chrome" หรือ "เปิดในเบราว์เซอร์")'
              : 'กดค้างที่รูปเพื่อบันทึกเป็นรูปภาพ หรือกด "ดาวน์โหลด PDF"')
            + '</p>';
          html += '</div>';
          window.openModal('ใบรายงาน ' + label + ' • ' + studentName, html);
          window.renderPdfAsImages_(document.getElementById('pp5ReportPages'), viewUrl, studentName);
          const openChrome = document.getElementById('pp5ReportOpenChrome');
          if (openChrome) {
            openChrome.addEventListener('click', async () => {
              const labelEl = openChrome.querySelector('span');
              if (openChrome.dataset.url) { window.location.href = openChrome.dataset.url; return; }
              openChrome.disabled = true;
              labelEl.textContent = 'กำลังเตรียมไฟล์...';
              try {
                const blob = await (await fetch(viewUrl)).blob();
                const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
                const signed = await window.PP5Data.reportExports.share(pdfBlob, fileName);
                const target = signed + (signed.includes('?') ? '&' : '?') + 'openExternalBrowser=1';
                openChrome.dataset.url = target;
                labelEl.textContent = 'แตะอีกครั้งถ้า Chrome ไม่เปิด';
                openChrome.disabled = false;
                window.location.href = target;
              } catch (error) {
                console.warn('report export for external browser failed', error);
                openChrome.disabled = false;
                labelEl.textContent = 'เปิดไฟล์ PDF ใน Chrome';
                const note = document.getElementById('pp5ReportNote');
                if (note) note.insertAdjacentHTML('afterbegin', '<span style="color:#b91c1c">เตรียมไฟล์ไม่สำเร็จ ลองกด "เปิดในเบราว์เซอร์ปกติ" แทน</span><br>');
              }
            });
          }
          return;
        }
        const message = result && result.success === false
          ? (result.message || 'ไม่สามารถสร้างใบรายงานได้')
          : (typeof result === 'string' ? result : JSON.stringify(result));
        window.openModal('ใบรายงาน ' + label + ' • ' + studentName, parentReportErrorHtml_(message));
      })
      .withFailureHandler(function(error) {
        window.openModal(
          'ใบรายงาน ' + label + ' • ' + studentName,
          parentReportErrorHtml_(error?.message || error)
        );
      })
      .generateParentReportCard(studentId, { term: normalizedTerm }, parentPortalToken_());
  };

  // Scores view: show each semester's own grade, so parents can read the
  // semester 1 result before semester 2 exists (the legacy table only had a
  // year-end grade column, which stays "-" for the whole first semester).
  const parentScoreCell_ = (value) => (value === '' || value === null || value === undefined) ? '-' : escapeParentText_(value);
  const parentGradeClass_ = (grade) => {
    const g = String(grade || '');
    if (['4', '4.0', '3.5', '3'].includes(g)) return 'grade-hi';
    if (['2.5', '2', '1.5'].includes(g)) return 'grade-mid';
    if (['1', '0.5', '0', '0.0', 'ร', 'มส', 'ไม่ผ่าน'].includes(g)) return 'grade-lo';
    if (g === 'ผ่าน') return 'grade-hi';
    return 'grade-def';
  };
  const parentGradePill_ = (grade) => '<span class="grade-pill ' + parentGradeClass_(grade) + '">' + parentScoreCell_(grade) + '</span>';
  const parentEmptyHtml_ = (message) => (typeof window.emptyHtml === 'function')
    ? window.emptyHtml(message)
    : '<div class="text-center text-muted p-4">' + escapeParentText_(message) + '</div>';

  window.viewScores = function viewScores(studentId, studentName) {
    const title = 'คะแนนวิชา • ' + studentName;
    window.openModal('คะแนนวิชา', window.loadingHtml('กำลังโหลดข้อมูลคะแนน'));
    google.script.run
      .withSuccessHandler(function(data) {
        if (!data || data.success === false) {
          window.openModal(title, parentReportErrorHtml_(data && data.message ? data.message : 'ไม่สามารถดึงข้อมูลได้'));
          return;
        }
        const scores = Array.isArray(data.scores) ? data.scores : [];
        const regular = scores.filter((s) => !s.isActivity);
        const activity = scores.filter((s) => s.isActivity);
        const hasActivityResult = activity.some((s) => s.activityGrade);
        if (!regular.length && !hasActivityResult) {
          window.openModal(title, parentEmptyHtml_('ยังไม่มีผลการเรียนที่ครูบันทึกเกรดแล้วในปีการศึกษา' + (data.academicYear ? ' ' + data.academicYear : 'นี้')));
          return;
        }
        let html = '<div style="overflow-x:auto">';
        if (data.academicYear) {
          html += '<div style="font-size:13px;color:var(--gray-500);margin-bottom:10px">ปีการศึกษา ' + escapeParentText_(data.academicYear) + '</div>';
        }
        if (regular.length) {
          html += '<table class="score-table pp5-sc-table"><thead><tr>';
          html += '<th style="width:70px" rowspan="2">รหัส</th><th rowspan="2">วิชา</th>';
          html += '<th colspan="2">ภาคเรียนที่ 1</th><th colspan="2">ภาคเรียนที่ 2</th><th colspan="2">ทั้งปี</th>';
          html += '</tr><tr><th>คะแนน</th><th>เกรด</th><th>คะแนน</th><th>เกรด</th><th>เฉลี่ย</th><th>เกรด</th></tr></thead><tbody>';
          // A semester still in progress (no final exam yet) shows its running score and
          // "รอสอบปลายภาค" instead of a grade — never a misleading grade 0.
          const termGradeCell_ = (grade, pending) => pending
            ? '<span class="grade-pill grade-def">รอสอบปลายภาค</span>'
            : (grade !== '' && grade != null ? parentGradePill_(grade) : '-');
          regular.forEach(function(s) {
            html += '<tr>';
            html += '<td style="color:var(--gray-500);font-size:12px">' + escapeParentText_(s.subjectCode || '') + '</td>';
            html += '<td style="text-align:left">' + escapeParentText_(s.name || '') + '</td>';
            html += '<td>' + parentScoreCell_(s.term1Score) + '</td><td>' + termGradeCell_(s.term1Grade, s.term1Pending) + '</td>';
            html += '<td>' + parentScoreCell_(s.term2Score) + '</td><td>' + termGradeCell_(s.term2Grade, s.term2Pending) + '</td>';
            html += '<td><strong>' + parentScoreCell_(s.average) + '</strong></td><td>' + (s.grade !== '' && s.grade != null ? parentGradePill_(s.grade) : '-') + '</td>';
            html += '</tr>';
          });
          html += '</tbody></table>';
          // Phones: one card per subject instead of an 8-column table that
          // hides semester 2 and the year result off-screen.
          html += '<div class="pp5-sc-list">';
          regular.forEach(function(s) {
            const cell = (score, grade, pending) => (score === '' || score === null || score === undefined)
              ? (grade !== '' && grade != null ? parentGradePill_(grade) : '<span style="color:var(--gray-500)">-</span>')
              : pending
                ? parentScoreCell_(score) + ' <span style="color:var(--gray-500)">คะแนนเก็บ</span> <span class="grade-pill grade-def">รอสอบปลายภาค</span>'
                : parentScoreCell_(score) + ' <span style="color:var(--gray-500)">คะแนน</span> ' + (grade !== '' && grade != null ? parentGradePill_(grade) : '');
            html += '<div class="pp5-sc-item">' +
              '<div class="pp5-sc-name">' + escapeParentText_(s.name || '') + ' <span>' + escapeParentText_(s.subjectCode || '') + '</span></div>' +
              '<div class="pp5-sc-row"><span>ภาคเรียนที่ 1</span><span>' + cell(s.term1Score, s.term1Grade, s.term1Pending) + '</span></div>' +
              '<div class="pp5-sc-row"><span>ภาคเรียนที่ 2</span><span>' + cell(s.term2Score, s.term2Grade, s.term2Pending) + '</span></div>' +
              '<div class="pp5-sc-row"><span>ทั้งปี (เฉลี่ย)</span><span>' + cell(s.average, s.grade) + '</span></div>' +
              '</div>';
          });
          html += '</div>';
          html += '<div style="font-size:12px;color:var(--gray-500);margin-top:8px">ภาคเรียนที่ยังไม่สอบปลายภาคแสดงเป็นคะแนนเก็บ ยังไม่มีเกรด · เกรดทั้งปีจะแสดงเมื่อครูบันทึกผลครบทั้ง 2 ภาคเรียน</div>';
        }
        if (activity.length) {
          html += '<div style="margin-top:20px;padding-top:16px;border-top:2px solid var(--gray-200)">';
          html += '<h6 style="font-weight:600;margin-bottom:10px;color:var(--gray-700)"><i class="bi bi-stars"></i> กิจกรรมพัฒนาผู้เรียน</h6>';
          html += '<table class="score-table"><thead><tr><th style="width:70px">รหัส</th><th>กิจกรรม</th><th>ผลการประเมิน</th></tr></thead><tbody>';
          activity.forEach(function(s) {
            html += '<tr><td style="color:var(--gray-500);font-size:12px">' + escapeParentText_(s.subjectCode || '') + '</td>';
            html += '<td style="text-align:left">' + escapeParentText_(s.name || '') + '</td>';
            html += '<td>' + (s.activityGrade ? parentGradePill_(s.activityGrade) : '<span class="grade-pill grade-def">ยังไม่ประเมิน</span>') + '</td></tr>';
          });
          html += '</tbody></table></div>';
        }
        html += '</div>';
        window.openModal(title, html);
      })
      .withFailureHandler(function(error) {
        window.openModal(title, parentReportErrorHtml_(error?.message || error));
      })
      .getParentStudentScores(studentId, parentPortalToken_());
  };

  if (!document.getElementById('pp5ParentMobileStyles')) {
    const mobileStyles = document.createElement('style');
    mobileStyles.id = 'pp5ParentMobileStyles';
    mobileStyles.textContent =
      '.pp5-sc-list{display:none}' +
      '.pp5-sc-item{border:1px solid var(--gray-200,#e5e7eb);border-radius:12px;padding:10px 12px;margin-bottom:8px}' +
      '.pp5-sc-name{font-weight:600;margin-bottom:6px}.pp5-sc-name span{font-weight:400;font-size:12px;color:var(--gray-500,#6b7280)}' +
      '.pp5-sc-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:3px 0;font-size:14px}' +
      '.pp5-att-row{display:grid;grid-template-columns:5.5em 1fr auto;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--gray-200,#e5e7eb);font-size:14px}' +
      '.pp5-att-bar{height:8px;border-radius:4px;background:var(--gray-200,#e5e7eb);overflow:hidden;display:flex}' +
      '.pp5-parent-attendance-table{width:100%;border-collapse:collapse;font-size:14px;margin:6px 0 20px}' +
      '.pp5-parent-attendance-table th,.pp5-parent-attendance-table td{padding:9px 6px;border-bottom:1px solid var(--gray-200,#e5e7eb);text-align:right;font-variant-numeric:tabular-nums}' +
      '.pp5-parent-attendance-table th:first-child{text-align:left}.pp5-parent-attendance-table thead th{font-size:13px;font-weight:600}.pp5-parent-attendance-table tbody th{font-weight:400}.pp5-parent-attendance-table tfoot{font-weight:700}' +
      '@media(max-width:576px){.pp5-parent-attendance-table{font-size:13px}.pp5-parent-attendance-table th,.pp5-parent-attendance-table td{padding:8px 4px}.pp5-parent-attendance-table thead th{font-size:12px}}' +
      '@media (max-width:576px){.pp5-sc-table{display:none}.pp5-sc-list{display:block}}';
    (document.head || frame).appendChild(mobileStyles);
  }

  // Attendance view: numeric monthly table plus the existing proportional bars.
  // Replaces the column chart, whose month labels overlapped on phones.
  window.viewAttendance = function viewAttendance(studentId, studentName) {
    const title = 'สรุปเวลาเรียน \u2022 ' + studentName;
    window.openModal('สรุปเวลาเรียน', window.loadingHtml('กำลังโหลดข้อมูลการเข้าเรียน'));
    google.script.run
      .withSuccessHandler(function(data) {
        const a = data && data.attendance;
        if (!data || data.success === false || !a) {
          window.openModal(title, parentReportErrorHtml_(data && data.message ? data.message : 'ไม่สามารถดึงข้อมูลได้'));
          return;
        }
        if (!a.totalDays) {
          window.openModal(title, parentEmptyHtml_('ยังไม่มีข้อมูลการเข้าเรียนในปีการศึกษานี้'));
          return;
        }
        const pct = Number(a.percentage || 0);
        const color = pct >= 80 ? 'var(--success,#16a34a)' : (pct >= 60 ? 'var(--warning,#d97706)' : 'var(--danger,#dc2626)');
        let html = '<div style="text-align:center;margin-bottom:16px">' +
          '<div style="font-size:44px;font-weight:700;line-height:1;color:' + color + '">' + pct.toFixed(1) + '<span style="font-size:18px">%</span></div>' +
          '<div style="font-size:13px;color:var(--gray-500)">อัตราการมาเรียน' + (data.asOf ? ' ถึงวันที่ ' + escapeParentText_(new Date(data.asOf + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })) : '') + '</div></div>';
        html += '<div class="stat-grid">' +
          '<div class="stat-card"><div class="num" style="color:var(--success)">' + (a.totalPresent || 0) + '</div><div class="lbl">มาเรียน</div></div>' +
          '<div class="stat-card"><div class="num" style="color:var(--warning)">' + (a.totalLeave || 0) + '</div><div class="lbl">ลา</div></div>' +
          '<div class="stat-card"><div class="num" style="color:var(--danger)">' + (a.totalAbsent || 0) + '</div><div class="lbl">ขาด</div></div></div>';
        html += '<div style="text-align:center;margin:8px 0 16px;font-size:13px;color:var(--gray-500)">รวม ' + (a.totalDays || 0) + ' วันเรียน</div>';
        const months = (a.monthly || []).filter((m) => m.total > 0);
        if (months.length) {
          html += '<h6 style="font-weight:600;margin-bottom:6px">ตารางเวลาเรียนรายเดือน</h6>';
          html += '<table class="pp5-parent-attendance-table" aria-label="เวลาเรียนรายเดือน หน่วยเป็นวัน"><thead><tr><th scope="col">เดือน</th><th scope="col">มาเรียน</th><th scope="col">ลา</th><th scope="col">ขาด</th><th scope="col">รวมวันเรียน</th></tr></thead><tbody>';
          months.forEach(function(m) {
            html += '<tr><th scope="row">' + escapeParentText_(m.month) + '</th><td>' + (m.present || 0) + '</td><td>' + (m.leave || 0) + '</td><td>' + (m.absent || 0) + '</td><td>' + m.total + '</td></tr>';
          });
          html += '</tbody><tfoot><tr><th scope="row">รวม</th><td>' + (a.totalPresent || 0) + '</td><td>' + (a.totalLeave || 0) + '</td><td>' + (a.totalAbsent || 0) + '</td><td>' + a.totalDays + '</td></tr></tfoot></table>';
          html += '<h6 style="font-weight:600;margin-bottom:6px">กราฟสัดส่วนรายเดือน</h6>';
          html += '<div class="pp5-att-row" style="font-size:12px;color:var(--gray-500)"><span>เดือน</span><span>มา / ลา / ขาด</span><span>วัน</span></div>';
          months.forEach(function(m) {
            const part = (n) => (m.total ? (n / m.total) * 100 : 0).toFixed(1) + '%';
            html += '<div class="pp5-att-row"><span>' + escapeParentText_(m.month) + '</span>' +
              '<span><div class="pp5-att-bar"><span style="width:' + part(m.present) + ';background:var(--success,#16a34a)"></span>' +
              '<span style="width:' + part(m.leave) + ';background:var(--warning,#d97706)"></span>' +
              '<span style="width:' + part(m.absent) + ';background:var(--danger,#dc2626)"></span></div>' +
              '<div style="font-size:12px;color:var(--gray-500);margin-top:2px">มา ' + m.present + ' · ลา ' + m.leave + ' · ขาด ' + m.absent + '</div></span>' +
              '<span>' + m.total + '</span></div>';
          });
        }
        window.openModal(title, html);
      })
      .withFailureHandler(function(error) {
        window.openModal(title, parentReportErrorHtml_(error?.message || error));
      })
      .getParentStudentAttendance(studentId, parentPortalToken_());
  };

  // grade (optional): ชั้น ม. ตัดสินผลรายภาค (owner 2026-10-11) ใบรายงานมีเฉพาะภาค 1 / ภาค 2 ไม่มีปุ่มผลประจำปี
  window.viewReportCard = function viewReportCard(studentId, studentName, grade) {
    const perSemester = /^ม\./.test(String(grade || '').trim());
    let html = '<div style="display:grid;gap:12px">';
    html += '<div style="padding:14px;border-radius:12px;background:#eff6ff;color:#1e3a8a;font-size:13px;line-height:1.65">';
    html += perSemester
      ? '<strong>เลือกภาคเรียนที่ต้องการ</strong><br>ชั้นมัธยมตัดสินผลการเรียนเป็นรายภาค ใบรายงานแต่ละภาคคือผลของภาคเรียนนั้น'
      : '<strong>เลือกรอบผลการเรียนที่ต้องการ</strong><br>รายงานรายภาคใช้แจ้งความก้าวหน้าระหว่างปี ส่วนผลประจำปีใช้สำหรับการตัดสินผลอย่างเป็นทางการ';
    html += '</div>';
    html += '<button type="button" class="btn btn-primary" data-report-term="1"><i class="bi bi-1-circle-fill"></i> ผลการเรียนภาคเรียนที่ 1</button>';
    html += '<button type="button" class="btn btn-outline-primary" data-report-term="2"><i class="bi bi-2-circle-fill"></i> ผลการเรียนภาคเรียนที่ 2</button>';
    if (!perSemester) html += '<button type="button" class="btn btn-outline-secondary" data-report-term="year"><i class="bi bi-calendar-check-fill"></i> ผลการเรียนประจำปี</button>';
    html += '</div>';
    window.openModal('เลือกรอบรายงาน • ' + studentName, html);
    document.querySelectorAll('#modalBody [data-report-term]').forEach(function(button) {
      button.addEventListener('click', function() {
        window.createParentReportCard(studentId, studentName, button.dataset.reportTerm);
      });
    });
  };

  installParentOverview_(frame, {
    escape: escapeParentText_,
    errorHtml: parentReportErrorHtml_
  });
}

// ── Parent portal overview (redesign 2026-09-27) ─────────────────────────────
// A parent sees one screen per child: welcome, child card, semester overview (GPA over
// finished subjects only, curriculum subject count, semester attendance), the three existing
// actions (คะแนน / เข้าเรียน / ใบรายงาน), the subject list for the semester and the homeroom
// teacher's note. Admin/teacher preview keeps the searchable card list; clicking a card's
// name opens the same overview with a way back. gas-pages.js is untouched: the template's
// global renderStudents() is wrapped.
function installParentOverview_(frame, helpers) {
  if (typeof window.renderStudents !== 'function' || window.renderStudents.__pp5Overview) return;
  const esc = helpers.escape;
  const originalRender = window.renderStudents;
  const state = { list: [], index: 0, semester: null, settings: null, fromPreview: false, seq: 0 };

  const initials_ = (st) => {
    const first = (value) => (String(value || '').match(/[ก-ฮA-Za-z]/) || [''])[0];
    return (first(st.firstName) + first(st.lastName)) || 'S';
  };
  const classLabel_ = (st) => {
    const grade = String(st.grade || '').trim();
    const room = String(st.classNo || st.room || '').trim();
    return (/^[ปอม]\./.test(grade) ? grade : (grade ? 'ป.' + grade : '')) + (room ? '/' + room : '');
  };
  const thaiDate_ = (iso) => {
    const d = new Date(String(iso || ''));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const gradeTone_ = (grade) => {
    const g = String(grade || '').trim();
    const n = Number(g);
    if (g === 'ร' || g === 'มส' || g === 'ไม่ผ่าน') return 'bad';
    if (g !== '' && Number.isFinite(n)) return n >= 3.5 ? 'hi' : n >= 2.5 ? 'good' : n >= 1 ? 'mid' : 'bad';
    return 'none';
  };
  const run_ = () => google.script.run;

  const ensureStyles_ = () => {
    if (document.getElementById('pp5ParentOverviewStyles')) return;
    const style = document.createElement('style');
    style.id = 'pp5ParentOverviewStyles';
    style.textContent = [
      '.pp5-pv{--pv-card:#fff;--pv-line:#ecebf6;--pv-text:#1e1b3a;--pv-muted:#6b7280;--pv-primary:#5b4fe0;--pv-shadow:0 6px 18px rgba(40,30,110,.06);max-width:880px;margin:0 auto;padding:4px 0 12px;display:grid;gap:14px;color:var(--pv-text);font-family:inherit}',
      '.pp5-pv *{box-sizing:border-box}',
      '.pp5-pv-card{background:var(--pv-card);border:1px solid var(--pv-line);border-radius:20px;padding:16px;box-shadow:var(--pv-shadow)}',
      '.pp5-pv-welcome{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;background:linear-gradient(135deg,#ffffff 0%,#f5f3ff 100%)}.pp5-pv-identity{min-width:0;overflow-wrap:anywhere}.pp5-pv-line-slot{align-self:start}.pp5-pv-line-slot:empty{display:none}.pp5-pv-identity .pp5-pv-name{margin-top:8px;font-size:.92rem}.pp5-pv-identity .pp5-pv-muted{font-size:.76rem}',
      '.pp5-pv-logo{width:64px;height:64px;flex:0 0 64px;border-radius:16px;background:#fff;border:1px solid var(--pv-line);display:flex;align-items:center;justify-content:center;overflow:hidden}',
      '.pp5-pv-logo img{width:100%;height:100%;object-fit:contain}',
      '.pp5-pv-logo i{font-size:30px;color:var(--pv-primary)}',
      '.pp5-pv-welcome h2{font-size:1.15rem;font-weight:700;margin:0 0 2px;line-height:1.35}',
      '.pp5-pv-welcome p,.pp5-pv-muted{margin:0;color:var(--pv-muted);font-size:.86rem}',
      '.pp5-pv-kids{display:flex;gap:8px;flex-wrap:wrap}',
      '.pp5-pv-kid{border:1px solid var(--pv-line);background:var(--pv-card);color:var(--pv-text);border-radius:999px;padding:6px 14px;font-size:.85rem;font-family:inherit;cursor:pointer}',
      '.pp5-pv-kid.active{background:var(--pv-primary);border-color:var(--pv-primary);color:#fff}',
      '.pp5-pv-student{display:flex;align-items:center;gap:14px}',
      '.pp5-pv-avatar{width:58px;height:58px;flex:0 0 58px;border-radius:50%;background:#ece9ff;color:var(--pv-primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.2rem;overflow:hidden}',
      '.pp5-pv-avatar img{width:100%;height:100%;object-fit:cover}',
      '.pp5-pv-name{font-weight:700;font-size:1.05rem;margin-bottom:4px}',
      '.pp5-pv-chip{display:inline-block;background:#ece9ff;color:var(--pv-primary);border-radius:8px;padding:2px 10px;font-size:.8rem;font-weight:600;margin-right:6px}',
      '.pp5-pv-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap}',
      '.pp5-pv-head h3{font-size:1rem;font-weight:700;margin:0;display:flex;align-items:center;gap:8px}',
      '.pp5-pv-head h3 i{color:var(--pv-primary)}',
      '.pp5-pv-sem{border:1px solid var(--pv-line);border-radius:10px;padding:6px 10px;font-family:inherit;font-size:.85rem;background:var(--pv-card);color:var(--pv-text)}',
      '.pp5-pv-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
      '.pp5-pv-stat{border-radius:16px;padding:12px;display:flex;gap:10px;align-items:flex-start;min-width:0}',
      '.pp5-pv-stat .ic{width:40px;height:40px;flex:0 0 40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.15rem}',
      '.pp5-pv-stat .lbl{font-size:.78rem;color:var(--pv-muted);line-height:1.3}',
      '.pp5-pv-stat .val{font-size:1.55rem;font-weight:700;line-height:1.2;margin:2px 0}',
      '.pp5-pv-stat .val.sm{font-size:.95rem;padding:6px 0 4px}',
      '.pp5-pv-stat .cap{font-size:.74rem;color:var(--pv-muted);line-height:1.35}',
      '.pp5-pv-stat .up{color:#059669;font-weight:600}.pp5-pv-stat .down{color:#dc2626;font-weight:600}',
      '.pp5-pv-stat.t1{background:#f3f1ff}.pp5-pv-stat.t1 .ic{background:#e2ddff;color:#5b4fe0}',
      '.pp5-pv-stat.t2{background:#edf5ff}.pp5-pv-stat.t2 .ic{background:#d9e8ff;color:#2563eb}',
      '.pp5-pv-stat.t3{background:#ecfaf2}.pp5-pv-stat.t3 .ic{background:#d3f5e2;color:#059669}',
      '.pp5-pv-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
      '.pp5-pv-act{border:0;border-radius:14px;padding:12px 6px;text-align:center;font-family:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:100px;position:relative;color:var(--pv-text);transition:transform .15s ease,box-shadow .15s ease}',
      '.pp5-pv-act:hover,.pp5-pv-act:focus-visible{transform:translateY(-2px);box-shadow:var(--pv-shadow);outline:none}',
      '.pp5-pv-act .big{width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 5px 12px rgba(36,64,100,.15);line-height:1}.pp5-pv-act .big svg{width:32px;height:32px}',
      '.pp5-pv-act b{font-size:.86rem;font-weight:500;line-height:1.4}',
      '.pp5-pv-act small,.pp5-pv-act .go{display:none}',
      '.pp5-pv-act.a1,.pp5-pv-act.a2,.pp5-pv-act.a3{background:transparent}.pp5-pv-act.a1 .big{background:linear-gradient(135deg,#b367e0,#8059d4)}.pp5-pv-act.a2 .big{background:linear-gradient(135deg,#52c6a0,#209a7a)}.pp5-pv-act.a3 .big{background:linear-gradient(135deg,#ffbc72,#f68d6f)}',
      '.pp5-pv-more{border:0;background:#ece9ff;color:var(--pv-primary);border-radius:999px;padding:6px 14px;font-size:.82rem;font-weight:600;font-family:inherit;cursor:pointer}',
      '.pp5-pv-rows{display:grid}',
      '.pp5-pv-row{display:grid;grid-template-columns:28px minmax(0,1fr) 84px 112px 16px;gap:8px;align-items:center;padding:10px 4px;border:0;border-top:1px solid var(--pv-line);background:none;text-align:left;font-family:inherit;color:var(--pv-text);cursor:pointer;width:100%}',
      '.pp5-pv-row.hd{cursor:default;border-top:0;font-size:.78rem;color:var(--pv-muted);padding-top:0}',
      '.pp5-pv-row .no{color:var(--pv-muted);font-size:.85rem;text-align:center}',
      '.pp5-pv-row .nm{font-size:.92rem;min-width:0;line-height:1.35;overflow-wrap:anywhere}',
      '.pp5-pv-row .sc{font-size:.9rem;text-align:center;white-space:nowrap}.pp5-pv-row .sc span{color:var(--pv-muted)}',
      '.pp5-pv-row .gr{text-align:center}.pp5-pv-row .ch{color:#b6b3c9}',
      '.pp5-pv-pill{display:inline-block;border-radius:999px;padding:3px 10px;font-size:.8rem;font-weight:700;white-space:nowrap}',
      '.pp5-pv-pill.hi{background:#dcfce7;color:#15803d}.pp5-pv-pill.good{background:#dbeafe;color:#1d4ed8}',
      '.pp5-pv-pill.mid{background:#fef3c7;color:#b45309}.pp5-pv-pill.bad{background:#fee2e2;color:#b91c1c}',
      '.pp5-pv-pill.wait{background:#fff4e0;color:#b45309;font-weight:600;font-size:.72rem}.pp5-pv-pill.none{background:#f1f2f6;color:#6b7280;font-weight:600;font-size:.72rem}',
      '.pp5-pv-note{background:#fff8e7;border:1px solid #fbe3a6;border-radius:20px;padding:14px 16px;display:flex;gap:12px}',
      '.pp5-pv-note .ic{width:40px;height:40px;flex:0 0 40px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.1rem}',
      '.pp5-pv-note .hd{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-weight:700;margin-bottom:4px}',
      '.pp5-pv-note .hd span{font-weight:400;font-size:.8rem;color:var(--pv-muted)}',
      '.pp5-pv-note p{margin:0;font-size:.9rem;line-height:1.65;white-space:pre-line}',
      '.pp5-pv-back{border:0;background:none;color:var(--pv-primary);font-family:inherit;font-weight:600;cursor:pointer;padding:0;justify-self:start}',
      '.pp5-pv-foot{text-align:center;font-size:.75rem;color:var(--pv-muted)}',
      '.pp5-pv-detail{display:grid;gap:8px}.pp5-pv-detail div{display:flex;justify-content:space-between;border-bottom:1px solid var(--gray-200,#e5e7eb);padding:8px 0}',
      '@media (max-width:576px){.pp5-pv-card{padding:14px;border-radius:18px}.pp5-pv-stats,.pp5-pv-actions{gap:8px}.pp5-pv-stat{flex-direction:column;padding:10px}.pp5-pv-stat .ic{width:34px;height:34px;flex-basis:34px;font-size:1rem}.pp5-pv-stat .val{font-size:1.3rem}.pp5-pv-act{min-height:96px;padding:10px 4px}.pp5-pv-row{grid-template-columns:20px minmax(0,1fr) 60px 96px 10px;gap:6px}.pp5-pv-row .sc{font-size:.84rem}.pp5-pv-pill.wait,.pp5-pv-pill.none{font-size:.68rem;padding:3px 7px}.pp5-pv-welcome h2{font-size:1.02rem}.pp5-pv-logo{width:54px;height:54px;flex-basis:54px}}',
      '[data-theme="dark"] .pp5-pv{--pv-card:#1f2233;--pv-line:#2f3350;--pv-text:#e7e9f6;--pv-muted:#9ea6bd;--pv-primary:#9d94ff;--pv-shadow:none}',
      '[data-theme="dark"] .pp5-pv-welcome{background:linear-gradient(135deg,#1f2233,#272a45)}',
      '.pp5-pv-interim{display:flex;gap:8px;align-items:flex-start;margin:0 0 10px;padding:8px 12px;border-radius:12px;background:#fff7e6;border:1px solid #fcd9a0;color:#8a4b00;font-size:.84rem;line-height:1.5}.pp5-pv-interim i{margin-top:2px}',
      '[data-theme="dark"] .pp5-pv-interim{background:#3a2f14;border-color:#6b5420;color:#fcd34d}',
      '[data-theme="dark"] .pp5-pv-logo,[data-theme="dark"] .pp5-pv-act .go{background:#2a2e48}',
      '[data-theme="dark"] .pp5-pv-avatar,[data-theme="dark"] .pp5-pv-chip,[data-theme="dark"] .pp5-pv-more{background:#302c5e}',
      '[data-theme="dark"] .pp5-pv-stat.t1,[data-theme="dark"] .pp5-pv-act.a1{background:#2a2750}[data-theme="dark"] .pp5-pv-stat.t1 .ic{background:#3a3570;color:#b9b2ff}',
      '[data-theme="dark"] .pp5-pv-stat.t2,[data-theme="dark"] .pp5-pv-act.a2{background:#1f2d4a}[data-theme="dark"] .pp5-pv-stat.t2 .ic{background:#27406b;color:#93c5fd}',
      '[data-theme="dark"] .pp5-pv-stat.t3,[data-theme="dark"] .pp5-pv-act.a3{background:#1c3a30}[data-theme="dark"] .pp5-pv-stat.t3 .ic{background:#235240;color:#6ee7b7}',
      '[data-theme="dark"] .pp5-pv-act.a1,[data-theme="dark"] .pp5-pv-act.a2,[data-theme="dark"] .pp5-pv-act.a3{background:transparent}[data-theme="dark"] .pp5-pv-act.a1 .big{color:#b9b2ff}[data-theme="dark"] .pp5-pv-act.a2 .big{color:#7dd3fc}[data-theme="dark"] .pp5-pv-act.a3 .big{color:#fca5a5}',
      '[data-theme="dark"] .pp5-pv-note{background:#3a2f17;border-color:#5c4a1e}',
      '[data-theme="dark"] .pp5-pv-pill.hi{background:#14532d;color:#bbf7d0}[data-theme="dark"] .pp5-pv-pill.good{background:#1e3a8a;color:#bfdbfe}',
      '[data-theme="dark"] .pp5-pv-pill.mid,[data-theme="dark"] .pp5-pv-pill.wait{background:#78350f;color:#fde68a}[data-theme="dark"] .pp5-pv-pill.bad{background:#7f1d1d;color:#fecaca}',
      '[data-theme="dark"] .pp5-pv-pill.none{background:#2f3350;color:#c7cbe0}'
    ].join('');
    (document.head || frame).appendChild(style);
  };

  const view_ = () => {
    let el = frame.querySelector('#pp5ParentView');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pp5ParentView';
      el.className = 'pp5-pv';
      const container = frame.querySelector('#studentsContainer');
      if (container && container.parentNode) container.parentNode.insertBefore(el, container);
      else frame.appendChild(el);
      el.addEventListener('click', onClick_);
      el.addEventListener('change', onChange_);
    }
    return el;
  };

  const showList_ = (show) => {
    ['#studentsContainer', '#adminSearchPanel'].forEach((selector) => {
      const node = frame.querySelector(selector);
      if (node) node.style.display = show ? '' : 'none';
    });
    const hero = frame.querySelector('.hero');
    if (hero) hero.style.display = show ? '' : 'none';
  };

  const loadSettings_ = (done) => {
    if (state.settings) { done(state.settings); return; }
    run_()
      .withSuccessHandler((s) => { state.settings = s || {}; done(state.settings); })
      .withFailureHandler(() => { state.settings = {}; done(state.settings); })
      .getGlobalSettings();
  };

  const greeting_ = () => {
    const user = window.currentUser || {};
    const name = String(user.displayName || user.firstName || '').trim();
    if (!name || state.fromPreview) return state.fromPreview ? 'มุมมองผู้ปกครอง' : 'สวัสดีค่ะ ผู้ปกครอง';
    return /^ผู้ปกครอง/.test(name) ? 'สวัสดีคุณผู้ปกครอง' : 'สวัสดีคุณ' + name;
  };

  const shellHtml_ = (settings) => {
    const st = state.list[state.index] || {};
    const logo = settings.logo || settings.schoolLogo || settings.logoUrl_lh3 || '';
    const school = settings['ชื่อโรงเรียน'] || settings.schoolName || '';
    const year = settings['ปีการศึกษา'] || settings.academicYear || '';
    let html = '';
    if (state.fromPreview) html += '<button type="button" class="pp5-pv-back" data-pv="back"><i class="bi bi-arrow-left"></i> กลับรายชื่อนักเรียน</button>';
    html += '<section class="pp5-pv-card pp5-pv-welcome">' +
      '<div class="pp5-pv-logo">' + (logo ? '<img src="' + esc(logo) + '" alt="ตราโรงเรียน">' : '<i class="bi bi-mortarboard-fill"></i>') + '</div>' +
      '<div class="pp5-pv-identity"><h2>' + esc(school) + '</h2>' + (year ? '<p>ปีการศึกษา ' + esc(year) + '</p>' : '') +
      // รูปลูก (ลิงก์ชั่วคราวจาก PP5Data.students ผู้ปกครองอ่านได้เฉพาะลูกที่ผูกไว้) ไม่มีรูป = หน้าตาเดิม
      '<div class="pp5-pv-kidrow">' + (st.photoUrl ? '<span class="pp5-pv-kidphoto"><img src="' + esc(st.photoUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>' : '') +
      '<div class="pp5-pv-name">' + esc(((st.title || '') + (st.firstName || '') + ' ' + (st.lastName || '')).trim()) + '</div></div>' +
      '<div class="pp5-pv-muted"><span class="pp5-pv-chip">' + esc(classLabel_(st)) + '</span>ID ' + esc(st.studentId || st.id || '') + '</div></div><div class="pp5-pv-line-slot" id="pp5ParentLineDock"></div></section>';
    if (state.list.length > 1) {
      html += '<div class="pp5-pv-kids" role="tablist">' + state.list.map((kid, index) =>
        '<button type="button" class="pp5-pv-kid' + (index === state.index ? ' active' : '') + '" data-pv="kid" data-index="' + index + '">' +
        esc((kid.firstName || '') + ' ' + classLabel_(kid)) + '</button>').join('') + '</div>';
    }
    html += '<div id="pp5PvBody">' + (typeof window.loadingHtml === 'function' ? window.loadingHtml('กำลังโหลดผลการเรียน') : 'กำลังโหลด...') + '</div>';
    return html;
  };

  const bodyHtml_ = (res) => {
    const st = state.list[state.index] || {};
    const isYear = res.semester === 'year';
    const term = isYear ? 'ผลการเรียนทั้งปี ' + res.academicYear : 'ภาคเรียนที่ ' + res.semester + '/' + res.academicYear;
    const semOptions = [1, 2, 'year'].map((s) => '<option value="' + s + '"' + (s === res.semester ? ' selected' : '') + '>' + (s === 'year' ? 'ผลการเรียนทั้งปี ' : 'ภาคเรียนที่ ' + s + '/') + esc(res.academicYear) + '</option>').join('');

    let gpaVal = '<div class="val sm">' + (isYear ? 'รอผลทั้งปี' : 'รอผลปลายภาค') + '</div>';
    let gpaCap = res.pendingCount ? (isYear ? 'รอผลครบทั้ง 2 ภาคเรียน' : 'ยังไม่มีวิชาที่สอบปลายภาค') : 'ยังไม่มีผลการเรียน';
    if (res.gpa !== null && res.gpa !== undefined) {
      gpaVal = '<div class="val">' + Number(res.gpa).toFixed(2) + '</div>';
      if (res.gpaChange !== null && res.gpaChange !== undefined) {
        const up = res.gpaChange >= 0;
        gpaCap = '<span class="' + (up ? 'up' : 'down') + '"><i class="bi bi-caret-' + (up ? 'up' : 'down') + '-fill"></i> ' + (up ? '+' : '') + Number(res.gpaChange).toFixed(2) + '</span> จากภาคเรียนที่ผ่านมา';
      } else {
        gpaCap = 'คิดจาก ' + res.gpaSubjects + ' วิชาที่มีผลแล้ว';
      }
    }
    const a = res.attendance || {};
    const attVal = a.total ? '<div class="val">' + (Number.isInteger(a.percentage) ? a.percentage : Number(a.percentage).toFixed(1)) + '%</div>' : '<div class="val sm">ยังไม่มีข้อมูล</div>';
    const attCap = a.total ? a.present + ' / ' + a.total + ' วัน' + (a.leave || a.absent ? ' · ลา ' + a.leave + ' · ขาด ' + a.absent : '') : (!isYear && res.semester !== res.currentSemester ? 'ยังไม่ถึงภาคเรียนนี้' : '');

    let html = '<section class="pp5-pv-card">' +
      '<div class="pp5-pv-head"><h3><i class="bi bi-bar-chart-fill"></i> ภาพรวมผลการเรียน</h3>' +
      '<select class="pp5-pv-sem" data-pv="semester" aria-label="เลือกช่วงผลการเรียน">' + semOptions + '</select></div>' +
      '<div class="pp5-pv-stats">' +
      '<div class="pp5-pv-stat t1"><div class="ic"><i class="bi bi-mortarboard-fill"></i></div><div><div class="lbl">เกรดเฉลี่ย (GPA)</div>' + gpaVal + '<div class="cap">' + gpaCap + '</div></div></div>' +
      '<div class="pp5-pv-stat t2"><div class="ic"><i class="bi bi-book-half"></i></div><div><div class="lbl">วิชาที่เรียน</div><div class="val">' + res.subjectCount + '</div><div class="cap">วิชา · มีผลแล้ว ' + res.finishedCount + '</div></div></div>' +
      '<div class="pp5-pv-stat t3"><div class="ic"><i class="bi bi-calendar2-check-fill"></i></div><div><div class="lbl">การเข้าเรียน</div>' + attVal + '<div class="cap">' + attCap + '</div></div></div>' +
      '</div></section>';

    html += '<div class="pp5-pv-actions">' +
      '<button type="button" class="pp5-pv-act a1" data-pv="scores"><span class="big" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="5" y="3" width="22" height="26" rx="3" fill="white"/><path d="M10 10h12M10 15h5" stroke="#9860d9" stroke-width="2" stroke-linecap="round"/><path d="m10 23 4-4 4 2 5-6" stroke="#9860d9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><b>ดูเกรด</b></button>' +
      '<button type="button" class="pp5-pv-act a2" data-pv="attend"><span class="big" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="4" y="6" width="24" height="23" rx="3" stroke="white" stroke-width="2.2"/><path d="M10 3v6M22 3v6M5 12h22m-16 8 4 4 7-8" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><b>เข้าเรียน</b></button>' +
      '<button type="button" class="pp5-pv-act a3" data-pv="report"><span class="big" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M8 3h12l5 5v21H8z" fill="white"/><path d="M20 3v6h5M12 14h9M12 18h9M12 22h6" stroke="#ed9271" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg></span><b>ใบรายงาน</b></button>' +
      '</div>';

    const subjects = res.subjects || [];
    html += '<section class="pp5-pv-card"><div class="pp5-pv-head"><h3><i class="bi bi-file-earmark-text-fill"></i> ผลการเรียนรายวิชา</h3></div>' +
      // Semester views are interim; the explicit year view is the annual result.
      // ปิดได้ด้วยสวิตช์ลายน้ำในหน้าตั้งค่าระบบ (res.interimNotice จาก getParentOverview)
      (!isYear && res.interimNotice !== false ? '<div class="pp5-pv-interim" role="note"><i class="bi bi-info-circle-fill"></i><span><b>' + esc(res.interimNoticeText || 'ผลระหว่างปี — ตัดสินผลการเรียนเป็นรายปี') + '</b><br>ระดับประถมศึกษาตัดสินผลการเรียนเป็นรายปี ผลภาคเรียนที่ ' + esc(res.semester) + ' เป็นผลระหว่างปี ยังไม่ใช่ผลการตัดสิน</span></div>' : '') +
      '<div class="pp5-pv-muted" style="margin:-6px 0 8px">' + esc(term) + (res.pendingCount ? (isYear ? ' · วิชาที่ยังไม่ครบทั้ง 2 ภาคเรียนแสดงรอผลทั้งปี' : ' · วิชาที่ยังไม่สอบปลายภาคแสดงเป็นคะแนนเก็บ') : '') + '</div>';
    if (!subjects.length) {
      html += '<div class="pp5-pv-muted" style="padding:12px 0">ยังไม่มีรายวิชาในชั้นนี้</div>';
    } else {
      html += '<div class="pp5-pv-rows"><div class="pp5-pv-row hd"><span class="no">#</span><span>รายวิชา</span><span class="sc">คะแนน</span><span class="gr">เกรด</span><span></span></div>';
      subjects.forEach((s, index) => {
        const max = (Number(s.midMax) || 0) + (Number(s.finalMax) || 0) || 100;
        const score = s.score === '' || s.score === null || s.score === undefined ? '<span>—</span>' : esc(s.score) + ' <span>/ ' + max + '</span>';
        let pill = '<span class="pp5-pv-pill none">ยังไม่มีคะแนน</span>';
        if (s.status === 'complete' || s.status === 'special') pill = '<span class="pp5-pv-pill ' + gradeTone_(s.grade) + '">' + esc(s.grade) + '</span>';
        else if (s.status === 'pending') pill = '<span class="pp5-pv-pill wait">' + (isYear ? 'รอผลทั้งปี' : 'รอสอบปลายภาค') + '</span>';
        html += '<button type="button" class="pp5-pv-row" data-pv="subject" data-index="' + index + '">' +
          '<span class="no">' + (index + 1) + '</span><span class="nm">' + esc(s.name) + '</span><span class="sc">' + score + '</span>' +
          '<span class="gr">' + pill + '</span><span class="ch"><i class="bi bi-chevron-right"></i></span></button>';
      });
      html += '</div>';
    }
    html += '</section>';

    const note = res.teacherNote;
    html += '<section class="pp5-pv-note"><div class="ic"><i class="bi bi-chat-dots-fill"></i></div><div style="flex:1;min-width:0">' +
      '<div class="hd">หมายเหตุจากครูประจำชั้น' + (note && note.updatedAt ? '<span>วันที่ ' + esc(thaiDate_(note.updatedAt)) + '</span>' : '') + '</div>' +
      (note ? '<p>' + esc(note.text) + '</p>' : '<p class="pp5-pv-muted">ครูประจำชั้นยังไม่ได้บันทึกหมายเหตุสำหรับ' + esc(term) + '</p>') +
      (res.homeroomTeacher ? '<div class="pp5-pv-muted" style="margin-top:6px">— ' + esc(res.homeroomTeacher) + '</div>' : '') +
      '</div></section>';
    state.last = res;
    state.lastStudent = st;
    return html;
  };

  const loadBody_ = () => {
    const st = state.list[state.index];
    const body = frame.querySelector('#pp5PvBody');
    if (!st || !body) return;
    const seq = ++state.seq;
    run_()
      .withSuccessHandler((res) => {
        if (seq !== state.seq) return;
        if (!res || res.success === false) { body.innerHTML = helpers.errorHtml(res && res.message ? res.message : 'ไม่สามารถดึงข้อมูลได้'); return; }
        state.semester = res.semester;
        body.innerHTML = bodyHtml_(res);
        body.style.display = 'grid';
        body.style.gap = '14px';
      })
      .withFailureHandler((error) => {
        if (seq !== state.seq) return;
        body.innerHTML = helpers.errorHtml(error && error.message ? error.message : error);
      })
      .getParentOverview(st.studentId || st.id, state.semester || '');
  };

  const render_ = () => {
    ensureStyles_();
    showList_(false);
    const el = view_();
    const lineCard = frame.querySelector('#pp5LineCard');
    if (lineCard && el.contains(lineCard)) frame.appendChild(lineCard);
    const topBar = frame.querySelector('.top-bar');
    if (topBar && !state.fromPreview) topBar.style.display = 'none';
    const footer = frame.querySelector('.footer');
    if (footer) footer.textContent = 'Powered by ครูประเทือง';
    el.style.display = '';
    el.innerHTML = (typeof window.loadingHtml === 'function' ? window.loadingHtml('กำลังโหลด') : '');
    loadSettings_((settings) => {
      const currentLineCard = frame.querySelector('#pp5LineCard');
      if (currentLineCard && el.contains(currentLineCard)) frame.appendChild(currentLineCard);
      el.innerHTML = shellHtml_(settings);
      if (currentLineCard?.classList.contains('pp5ln-linked')) el.querySelector('#pp5ParentLineDock')?.appendChild(currentLineCard);
      loadBody_();
    });
  };

  const subjectDetail_ = (s) => {
    const isYear = state.last?.semester === 'year';
    const row = (label, value) => '<div><span>' + label + '</span><strong>' + value + '</strong></div>';
    const statusText = s.status === 'complete' ? 'มีผลการเรียนแล้ว' : s.status === 'pending' ? (isYear ? 'รอผลครบทั้ง 2 ภาคเรียน' : 'รอสอบปลายภาค') : s.status === 'special' ? 'ผลการเรียน ' + esc(s.grade) : 'ครูยังไม่ได้บันทึกคะแนน';
    let html = '<div class="pp5-pv-detail">' +
      row('รหัสวิชา', esc(s.code || '-')) +
      (isYear ? '' : row('คะแนนเก็บ', s.midScore === '' ? '-' : esc(s.midScore) + ' / ' + esc(s.midMax)) +
      row('สอบปลายภาค', s.finalScore === '' ? (s.status === 'complete' ? '-' : 'ยังไม่สอบ') : esc(s.finalScore) + ' / ' + esc(s.finalMax))) +
      row(isYear ? 'คะแนนทั้งปี' : 'คะแนนรวม', s.score === '' ? '-' : esc(s.score)) +
      row('เกรด', s.status === 'complete' || s.status === 'special' ? '<span class="pp5-pv-pill ' + gradeTone_(s.grade) + '">' + esc(s.grade) + '</span>' : '-') +
      row('สถานะ', statusText) + '</div>';
    if (s.status === 'pending') html += '<div style="font-size:12px;color:var(--gray-500);margin-top:10px">' + (isYear ? 'เกรดทั้งปีจะแสดงเมื่อมีผลครบทั้ง 2 ภาคเรียน' : 'เกรดจะแสดงเมื่อครูบันทึกคะแนนสอบปลายภาคแล้ว') + '</div>';
    window.openModal(s.name || 'รายวิชา', '<div class="pp5-pv">' + html + '</div>');
  };

  function onClick_(event) {
    const target = event.target.closest('[data-pv]');
    if (!target) return;
    const action = target.getAttribute('data-pv');
    const st = state.list[state.index] || {};
    const sid = st.studentId || st.id;
    const name = st.firstName || '';
    if (action === 'scores' && typeof window.viewScores === 'function') window.viewScores(sid, name);
    else if (action === 'attend' && typeof window.viewAttendance === 'function') window.viewAttendance(sid, name);
    else if (action === 'report' && typeof window.viewReportCard === 'function') window.viewReportCard(sid, name, st.grade);
    else if (action === 'subject' && state.last) subjectDetail_(state.last.subjects[Number(target.getAttribute('data-index'))] || {});
    else if (action === 'kid') { state.index = Number(target.getAttribute('data-index')) || 0; render_(); }
    else if (action === 'back') {
      const el = frame.querySelector('#pp5ParentView');
      if (el) el.style.display = 'none';
      state.fromPreview = false;
      showList_(true);
    }
  }

  function onChange_(event) {
    if (event.target.getAttribute('data-pv') !== 'semester') return;
    state.semester = event.target.value === 'year' ? 'year' : Number(event.target.value) || null;
    const body = frame.querySelector('#pp5PvBody');
    if (body && typeof window.loadingHtml === 'function') body.innerHTML = window.loadingHtml('กำลังโหลดผลการเรียน');
    loadBody_();
  }

  const wrapped = function renderStudents(list) {
    const arr = Array.isArray(list) ? list : [];
    if (!window.isAdminPreview && arr.length) {
      state.list = arr;
      state.index = 0;
      state.fromPreview = false;
      render_();
      return;
    }
    originalRender(arr);
    const cards = frame.querySelectorAll('#studentsContainer .s-card');
    cards.forEach((card, index) => {
      const st = arr[index];
      if (!st) return;
      const badge = card.querySelector('.badge-grade');
      if (badge) badge.textContent = classLabel_(st);
      const header = card.querySelector('.s-card-header');
      if (!header) return;
      header.style.cursor = 'pointer';
      header.title = 'เปิดมุมมองผู้ปกครองของนักเรียนคนนี้';
      header.addEventListener('click', () => {
        state.list = [st];
        state.index = 0;
        state.semester = null;
        state.fromPreview = true;
        render_();
      });
    });
  };
  wrapped.__pp5Overview = true;
  window.renderStudents = wrapped;
}

function enhanceSupabaseSchoolMisPage_() {
  const frame = document.getElementById('contentFrame');
  if (!frame) return;

  // ปรับหัวข้อหน้าให้สื่อความหมายชัดเจน
  const headerTitle = frame.querySelector('.sync-page-header h2');
  if (headerTitle) {
    headerTitle.innerHTML = '<i class="fas fa-file-export me-2"></i>ส่งออกคะแนนสู่ระบบ SchoolMIS (สพฐ.)';
  }

  // ซ่อนแท็บ นำเข้า และ เปรียบเทียบ
  const tabs = frame.querySelectorAll('.sync-tab');
  if (tabs.length >= 3) {
    tabs[0].style.display = 'none';
    tabs[2].style.display = 'none';
    tabs.forEach((t) => t.classList.remove('active'));
    tabs[1].classList.add('active');
    const tabsContainer = frame.querySelector('.sync-tabs');
    if (tabsContainer) tabsContainer.style.display = 'none';
  }

  // แสดงเนื้อหาแท็บส่งออกเท่านั้น
  const importContent = frame.querySelector('#importTabContent');
  const exportContent = frame.querySelector('#exportTabContent');
  const compareContent = frame.querySelector('#compareTabContent');

  if (importContent) {
    importContent.classList.remove('active');
    importContent.style.display = 'none';
  }
  if (compareContent) {
    compareContent.classList.remove('active');
    compareContent.style.display = 'none';
  }
  if (exportContent) {
    exportContent.classList.add('active');
    exportContent.style.display = 'block';
  }

  // เพิ่มกล่องคำแนะนำที่เข้าใจง่ายและเป็นมิตรกับครู
  if (!frame.querySelector('#pp5SchoolMisBanner')) {
    const banner = document.createElement('div');
    banner.id = 'pp5SchoolMisBanner';
    banner.style.cssText = 'background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 12px; padding: 14px 18px; margin-bottom: 1.25rem; font-size: 0.95rem; display: flex; align-items: flex-start; gap: 12px;';
    banner.innerHTML = '<i class="fas fa-check-circle" style="font-size: 1.5rem; color: #16a34a; margin-top: 2px;"></i>' +
      '<div>' +
      '<strong style="font-size: 1.05rem; color: #15803d;">พร้อมส่งออกคะแนนสู่ระบบ SchoolMIS ของ สพฐ.</strong><br>' +
      '<span style="color: #374151;">โปรแกรม ปพ.5 Smart คำนวณคะแนนและเกรดตามมาตรฐาน 21 คอลัมน์ของ สพฐ. เรียบร้อยแล้ว — คุณครูเพียงเลือก <strong>ชั้น/ห้อง</strong> และ <strong>วิชา</strong> จากนั้นคลิก <strong>ดาวน์โหลด (ภาคเดียว)</strong> หรือ <strong>ดาวน์โหลด เฉลี่ย 2 ภาค</strong> เพื่อนำไฟล์ CSV ไปอัปโหลดเข้าสู่เว็บ SchoolMIS ได้ทันที</span>' +
      '</div>';
    const optionsDiv = frame.querySelector('.sync-options');
    if (optionsDiv && optionsDiv.parentNode) {
      optionsDiv.parentNode.insertBefore(banner, optionsDiv);
    }
  }

  if (exportContent) enhanceSchoolMisTemplateFill_(frame, exportContent);
}

// "เติมคะแนนลงไฟล์แม่แบบ SchoolMIS": the teacher uploads the "ไฟล์นำเข้า gpa" CSV that SchoolMIS
// itself produced (blank scores), the bridge fills the scores in SchoolMIS's own row order and
// layout, and the browser downloads it under the same file name, ready to upload back.
function enhanceSchoolMisTemplateFill_(frame, exportContent) {
  if (exportContent.querySelector('#pp5MisTemplate')) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const card = document.createElement('div');
  card.id = 'pp5MisTemplate';
  card.style.cssText = 'border:1px solid color-mix(in srgb, var(--primary-light) 30%, #fff);background:#f5f7ff;border-radius:12px;padding:16px 18px;margin-top:1.25rem';
  card.innerHTML =
    '<div style="font-weight:700;color:color-mix(in srgb, var(--primary) 70%, #000);font-size:1.05rem"><i class="fas fa-file-import me-2"></i>เติมคะแนนลงไฟล์แม่แบบจาก SchoolMIS (แนะนำ)</div>' +
    '<ol style="margin:8px 0 12px;padding-left:20px;color:#374151;font-size:.92rem">' +
    '<li>ในเว็บ SchoolMIS ดาวน์โหลด "ไฟล์นำเข้า gpa" ของวิชาและห้องนี้ (ไฟล์ .csv ที่มีรายชื่อแต่ยังไม่มีคะแนน)</li>' +
    '<li>เลือก ชั้น/ห้อง และวิชาด้านบนให้ตรงกับไฟล์นั้น</li>' +
    '<li>เลือกไฟล์และภาคเรียน แล้วกด "เติมคะแนน" — ได้ไฟล์ชื่อเดิม เรียงลำดับตาม SchoolMIS พร้อมอัปโหลดกลับ</li></ol>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">' +
    '<input type="file" id="pp5MisTemplateFile" accept=".csv" class="form-control" style="max-width:340px">' +
    '<select id="pp5MisTemplateMode" class="form-select" style="max-width:190px"><option value="term1">ภาคเรียนที่ 1</option><option value="term2">ภาคเรียนที่ 2</option><option value="average">เฉลี่ย 2 ภาค</option></select>' +
    '<button type="button" id="pp5MisTemplateRun" class="sync-btn sync-btn-primary"><i class="fas fa-fill-drip"></i> เติมคะแนน</button></div>' +
    '<div id="pp5MisTemplateResult" style="margin-top:12px" aria-live="polite"></div>';
  exportContent.appendChild(card);

  const result = card.querySelector('#pp5MisTemplateResult');
  const show = (html) => { result.innerHTML = html; };
  const list = (title, rows, render, tone) => rows.length
    ? `<div style="margin-top:8px;padding:10px 12px;border-radius:10px;background:${tone === 'bad' ? '#fef2f2' : '#fffbeb'};color:${tone === 'bad' ? '#991b1b' : '#92400e'}"><b>${esc(title)} (${rows.length})</b><ul style="margin:6px 0 0;padding-left:18px">`
      + rows.slice(0, 15).map((row) => `<li>${render(row)}</li>`).join('') + (rows.length > 15 ? `<li>และอีก ${rows.length - 15} คน</li>` : '') + '</ul></div>'
    : '';
  const download = (base64, fileName) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  card.querySelector('#pp5MisTemplateRun').addEventListener('click', async () => {
    const file = card.querySelector('#pp5MisTemplateFile').files?.[0];
    const sheetName = frame.querySelector('#syncSheetSelect')?.value || '';
    if (!sheetName) { show('<div class="text-danger">กรุณาเลือกชั้น/ห้อง และวิชาด้านบนก่อน</div>'); return; }
    if (!file) { show('<div class="text-danger">กรุณาเลือกไฟล์แม่แบบ .csv ที่ดาวน์โหลดจาก SchoolMIS</div>'); return; }
    const button = card.querySelector('#pp5MisTemplateRun');
    button.disabled = true;
    show('<div class="text-muted">กำลังเติมคะแนน...</div>');
    try {
      const textValue = new TextDecoder('utf-8').decode(await file.arrayBuffer());
      if (textValue.includes('\uFFFD')) throw new Error('อ่านไฟล์ไม่ได้ — ไฟล์ไม่ใช่ UTF-8 กรุณาใช้ไฟล์ .csv ที่ดาวน์โหลดจาก SchoolMIS โดยตรง (อย่าเปิดแล้วบันทึกทับด้วย Excel)');
      const out = await window.GasServer.fillSchoolMISTemplate(textValue, sheetName, card.querySelector('#pp5MisTemplateMode').value, file.name);
      download(out.base64, out.fileName);
      const r = out.report;
      show(`<div style="padding:10px 12px;border-radius:10px;background:#ecfdf5;color:#065f46"><b>✅ ${esc(out.message)}</b> — ดาวน์โหลดไฟล์ <b>${esc(out.fileName)}</b> แล้ว `
        + '<button type="button" class="btn btn-sm btn-outline-success ms-2" id="pp5MisTemplateAgain">ดาวน์โหลดอีกครั้ง</button></div>'
        + list('มีใน SchoolMIS แต่ไม่พบในระบบ — แถวนี้ไม่มีคะแนน ตรวจรายชื่อก่อนอัปโหลด', r.notInSystem, (x) => `รหัส ${esc(x.id || '-')} ${esc(x.name)}`, 'bad')
        + list('มีในระบบแต่ไม่อยู่ในไฟล์ SchoolMIS', r.notInTemplate, (x) => `รหัส ${esc(x.id)} ${esc(x.name)}`, 'bad')
        + list('เลขประจำตัวประชาชนไม่ตรงกัน', r.idCardMismatch, (x) => `รหัส ${esc(x.id)} ${esc(x.name)}`, 'bad')
        + list('รหัสนักเรียนไม่ตรง (จับคู่ด้วยเลขประชาชนแทน)', r.matchedByIdCard, (x) => `SchoolMIS ${esc(x.id || '-')} = ระบบ ${esc(x.systemId)} ${esc(x.name)}`)
        + list('ชื่อ-นามสกุลสะกดต่างกัน (เติมคะแนนแล้ว ใช้ชื่อตาม SchoolMIS)', r.nameMismatch, (x) => `รหัส ${esc(x.id)}: SchoolMIS "${esc(x.schoolmis)}" / ระบบ "${esc(x.system)}"`));
      result.querySelector('#pp5MisTemplateAgain')?.addEventListener('click', () => download(out.base64, out.fileName));
    } catch (error) {
      show(`<div class="text-danger">${esc(error?.message || error)}</div>`);
    } finally {
      button.disabled = false;
    }
  });
}

/* ==========================================================================
   HOMEROOM TEACHER JOURNEY ROADMAP (LINEAR METRO PIPELINE ENHANCEMENT)
   ========================================================================== */
// ── Home hub: main menu cards + category chips (design "E", 2026-09-27) ──
// Additive only: the old sections stay below with every card and route they
// had. The old "เมนูด่วน" grid is hidden because the main menu replaces it;
// its one card found nowhere else (ภาพรวมสถิติ / dashboard) is moved into
// the reports section first, so no teacher route disappears.
// ซ่อน/แสดงแต่ละหมวดเมนูในหน้าหลัก (จำสถานะไว้ในเบราว์เซอร์ของผู้ใช้)
const HUB_COLLAPSED_KEY_ = 'pp5HubCollapsedSections';
const HUB_ACTIVE_TAB_KEY_ = 'pp5HubActiveTab';
function readHubCollapsed_() {
  try {
    const list = JSON.parse(localStorage.getItem(HUB_COLLAPSED_KEY_) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (_) { return []; }
}
function setHubSectionCollapsed_(section, collapsed, remember) {
  if (!section) return;
  section.classList.toggle('pp5-sec-collapsed', !!collapsed);
  const head = section.querySelector('.hub-section-title');
  if (head) {
    head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const label = head.querySelector('.pp5-sec-toggle-label');
    if (label) label.textContent = collapsed ? 'แสดง' : 'ซ่อน';
  }
  if (remember === false) return;
  const key = section.getAttribute('data-section');
  const list = readHubCollapsed_().filter((k) => k !== key);
  if (collapsed) list.push(key);
  try { localStorage.setItem(HUB_COLLAPSED_KEY_, JSON.stringify(list)); } catch (_) {}
}
function enhanceHubSectionToggles_(hubPage) {
  if (!hubPage) return;
  if (!document.getElementById('pp5HubSectionToggleStyles')) {
    const style = document.createElement('style');
    style.id = 'pp5HubSectionToggleStyles';
    style.textContent = [
      '#homeHubPage .hub-section-title.pp5-sec-head{cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px}',
      '#homeHubPage .pp5-sec-toggle{margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;background:#eef0ff;color:var(--primary);font-size:.8rem;font-weight:600}',
      '#homeHubPage .pp5-sec-toggle i{transition:transform .2s ease;font-size:.75rem}',
      '#homeHubPage .pp5-sec-collapsed .pp5-sec-toggle i{transform:rotate(-90deg)}',
      '#homeHubPage .pp5-sec-collapsed > :not(.hub-section-title){display:none!important}',
      '#homeHubPage .hub-section-title.pp5-sec-head:focus-visible{outline:3px solid color-mix(in srgb, var(--primary-light) 50%, #fff);outline-offset:3px;border-radius:8px}',
      '[data-theme="dark"] #homeHubPage .pp5-sec-toggle{background:#2e3348;color:color-mix(in srgb, var(--primary-light) 30%, #fff)}'
    ].join('\n');
    (document.head || hubPage).appendChild(style);
  }
  const collapsed = new Set(readHubCollapsed_());
  hubPage.querySelectorAll('.hub-section[data-section]').forEach((section) => {
    const key = section.getAttribute('data-section');
    const head = section.querySelector('.hub-section-title');
    if (key === 'quick' || !head || head.classList.contains('pp5-sec-head')) return;
    head.classList.add('pp5-sec-head');
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.insertAdjacentHTML('beforeend', '<span class="pp5-sec-toggle"><span class="pp5-sec-toggle-label">ซ่อน</span><i class="bi bi-chevron-down"></i></span>');
    // In tab mode a section is shown alone, so collapsing it would only leave an empty tab.
    const toggle = () => { if (!hubPage.classList.contains('pp5-tabs')) setHubSectionCollapsed_(section, !section.classList.contains('pp5-sec-collapsed')); };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
    });
    setHubSectionCollapsed_(section, collapsed.has(key), false);
  });
}

function enhanceHomeHubMainMenu_(hubPage) {
  if (!hubPage || hubPage.querySelector('#pp5HubMainMenu')) return;
  const role = String(localStorage.getItem('role') || 'teacher').toLowerCase();
  if (role === 'parent') return;

  if (!document.getElementById('pp5HubMainMenuStyles')) {
    const style = document.createElement('style');
    style.id = 'pp5HubMainMenuStyles';
    style.textContent = `
.pp5-mm-panel{background:#fff;border-radius:22px;padding:22px;margin-bottom:1.25rem;box-shadow:0 6px 24px rgba(30,27,58,.06)}
.pp5-mm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.pp5-mm-title{display:flex;align-items:center;gap:10px;font-size:1.15rem;font-weight:700;color:#1e293b;margin:0}
.pp5-mm-title i{color:#4285dc;font-size:1.3rem}
.pp5-mm-all{border:none;background:none;color:var(--primary);font-weight:600;font-size:.92rem;cursor:pointer;padding:6px}
.pp5-mm-grid,.pp5-mm-cats{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:18px 12px}
.pp5-mm-cats{padding:8px 0 20px;margin-bottom:20px;border-bottom:1px solid #edf0f5}
.pp5-mm-shortcuts{font-size:.86rem;font-weight:600;color:#64748b;margin:0 0 12px}
.pp5-mm-card,.pp5-mm-cat,.pp5-mm-cats>.btn{border:0;background:transparent;border-radius:16px;padding:8px 4px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:10px;cursor:pointer;font-family:inherit;color:#253047;min-width:0;white-space:normal;line-height:1.4;transition:background .18s ease}
.pp5-mm-card:hover,.pp5-mm-cat:hover,.pp5-mm-cats>.btn:hover{background:#f5f7fc}
.pp5-mm-card:focus-visible,.pp5-mm-cat:focus-visible,.pp5-mm-cats>.btn:focus-visible{outline:3px solid color-mix(in srgb, var(--primary-light) 70%, #fff);outline-offset:3px}
.pp5-mm-icon,.pp5-mm-cat>i,.pp5-mm-cats>.btn>i{width:76px;height:76px;flex-shrink:0;border-radius:22px;background:linear-gradient(135deg,var(--mm-start,#58b8e8),var(--mm-end,#5973db));color:#fff;display:flex;align-items:center;justify-content:center;font-size:2rem;box-shadow:0 7px 14px rgba(41,59,100,.17),inset 0 1px 0 rgba(255,255,255,.28);transition:transform .18s ease,box-shadow .18s ease}
.pp5-mm-card:hover .pp5-mm-icon,.pp5-mm-cat:hover>i,.pp5-mm-cats>.btn:hover>i{transform:translateY(-3px);box-shadow:0 10px 20px rgba(41,59,100,.23)}
.pp5-mm-foot{display:block;width:100%}
.pp5-mm-name,.pp5-mm-cat b{display:block;font-size:.9rem;font-weight:600;color:inherit;line-height:1.45;overflow-wrap:anywhere}
.pp5-mm-desc,.pp5-mm-arrow{display:none}
.pp5-mm-cat small{display:block;font-size:.73rem;color:#7c8798;margin-top:3px}
.pp5-mm-cats>.btn{font-size:.9rem;font-weight:600;--mm-start:#7895e8;--mm-end:#785bba}
.hub-section.pp5-mm-flash{animation:pp5MmFlash 1.4s ease}
@keyframes pp5MmFlash{0%,60%{box-shadow:0 0 0 4px color-mix(in srgb, var(--primary-light) 35%, transparent);border-radius:16px}100%{box-shadow:none}}
#homeHubPage .hub-section[data-section="quick"].pp5-mm-replaced{display:none!important}
@media(max-width:575px){.pp5-mm-panel{padding:16px 10px}.pp5-mm-grid,.pp5-mm-cats{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 4px}.pp5-mm-icon,.pp5-mm-cat>i,.pp5-mm-cats>.btn>i{width:64px;height:64px;border-radius:19px;font-size:1.75rem}.pp5-mm-name,.pp5-mm-cat b,.pp5-mm-cats>.btn{font-size:.8rem}.pp5-mm-title{font-size:1.05rem}}
[data-theme="dark"] .pp5-mm-panel{background:#1e2130}
[data-theme="dark"] .pp5-mm-title,[data-theme="dark"] .pp5-mm-card,[data-theme="dark"] .pp5-mm-cat,[data-theme="dark"] .pp5-mm-cats>.btn{color:#e5e7f5}
[data-theme="dark"] .pp5-mm-card:hover,[data-theme="dark"] .pp5-mm-cat:hover,[data-theme="dark"] .pp5-mm-cats>.btn:hover{background:#2a3046}
[data-theme="dark"] .pp5-mm-cats{border-color:#34394f}
[data-theme="dark"] .pp5-mm-shortcuts,[data-theme="dark"] .pp5-mm-cat small{color:#a9b2c9}
@media(prefers-reduced-motion:reduce){.pp5-mm-icon,.pp5-mm-cat>i,.pp5-mm-card,.pp5-mm-cat{transition:none}.hub-section.pp5-mm-flash{animation:none}}
.pp5-hub-tabs{display:flex;align-items:flex-end;gap:4px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;margin:0 -22px 18px;padding:4px 22px 0;box-shadow:inset 0 -1px 0 #e1e6ef;-webkit-overflow-scrolling:touch}
.pp5-hub-tabs::-webkit-scrollbar{display:none}
.pp5-hub-tab{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;border:1px solid #e6eaf2;border-bottom-color:#e1e6ef;border-radius:11px 11px 0 0;background:#f6f8fb;color:#64748b;padding:10px 14px 10px;font:inherit;font-size:.92rem;font-weight:600;cursor:pointer;white-space:nowrap;overflow:hidden;transition:color .15s ease,background .15s ease}
.pp5-hub-tab i{font-size:1rem;opacity:.8}
.pp5-hub-tab::after{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,var(--mm-start,#7787ef),var(--mm-end,#8760ce));opacity:0;transition:opacity .18s ease}
.pp5-hub-tab:hover{color:#1e293b;background:#eef1f7}
.pp5-hub-tab[aria-selected="true"]{color:var(--mm-fg,#4f46e5);font-weight:700;background:#fff;border-color:#dde3ee;border-bottom-color:#fff;padding-top:12px}
.pp5-hub-tab[aria-selected="true"] i{opacity:1}
.pp5-hub-tab[aria-selected="true"]::after{opacity:1}
.pp5-hub-tab:focus-visible{outline:3px solid color-mix(in srgb, var(--primary-light) 70%, #fff);outline-offset:-3px}
#homeHubPage.pp5-tabs .pp5-mm-cats{border-bottom:0;margin-bottom:0;padding-bottom:4px}
#homeHubPage.pp5-tabs .pp5-mm-shortcuts{display:none}
#homeHubPage.pp5-tabs:not(.pp5-tab-search) [data-tab-pane].pp5-tab-off,
#homeHubPage.pp5-tabs:not(.pp5-tab-search) .hub-section.pp5-tab-off{display:none!important}
#homeHubPage.pp5-tabs.pp5-tab-search [data-tab-pane]{display:none!important}
#homeHubPage.pp5-tabs.pp5-tab-search .pp5-hub-tabs{opacity:.45}
#homeHubPage .pp5-mm-panel .pp5-hub-tab-sections .hub-section{background:transparent!important;box-shadow:none!important;padding:0!important;margin:0 0 8px!important;border-radius:0}
#homeHubPage.pp5-tabs:not(.pp5-tab-search) .pp5-hub-tab-sections .hub-section>.hub-section-title{display:none}
#homeHubPage.pp5-tabs .pp5-sec-toggle{display:none}
#homeHubPage.pp5-tabs .hub-section-title.pp5-sec-head{cursor:default}
[data-theme="dark"] .pp5-hub-tabs{box-shadow:inset 0 -1px 0 #3a3f56}
[data-theme="dark"] .pp5-hub-tab{color:#a9b2c9;background:#23273a;border-color:#33384e;border-bottom-color:#3a3f56}
[data-theme="dark"] .pp5-hub-tab:hover{background:#2a3046;color:#e5e7f5}
[data-theme="dark"] .pp5-hub-tab[aria-selected="true"]{color:color-mix(in srgb, var(--primary-light) 30%, #fff);background:#1e2130;border-color:#3a3f56;border-bottom-color:#1e2130}
@media(max-width:575px){.pp5-hub-tabs{margin:0 -10px 14px;padding:4px 10px 0;gap:3px}.pp5-hub-tab{padding:9px 11px;font-size:.84rem}.pp5-hub-tab[aria-selected="true"]{padding-top:11px}}
@media(prefers-reduced-motion:reduce){.pp5-hub-tab,.pp5-hub-tab::after{transition:none}}
@media(min-width:1200px){.pp5-hub-tabs{gap:6px}}
`;
    document.head.appendChild(style);
  }

  const palette = {
    violet: { start: '#ad80ff', end: '#7934f5', fg: '#4f46e5', bg: '#f6f1ff', bd: '#e2d0ff', chip: '#e0ddfc' },
    blue: { start: '#30b9ff', end: '#0050ff', fg: '#1d4ed8', bg: '#effaff', bd: '#b6e8ff', chip: '#d7e5fc' },
    teal: { start: '#56dc85', end: '#00b961', fg: '#0f766e', bg: '#f0fcf5', bd: '#c8f0db', chip: '#cdeee6' },
    rose: { start: '#ff77af', end: '#fa287f', fg: '#be123c', bg: '#fff2f8', bd: '#ffc9e3', chip: '#fbd9e1' },
    orange: { start: '#f4c671', end: '#ef946b', fg: '#c2410c', bg: '#fff5ea', bd: '#fde7cf', chip: '#ffe6c9' },
    purple: { start: '#c26dff', end: '#8b35ef', fg: '#6d28d9', bg: '#f7f1ff', bd: '#e4d0ff', chip: '#e4ddfb' },
    sky: { start: '#60d0e5', end: '#4893db', fg: '#0369a1', bg: '#edf7fd', bd: '#d9eefb', chip: '#d3ebfa' },
    slate: { start: '#65a5b9', end: '#32627f', fg: '#334155', bg: '#f0f8fc', bd: '#cce4f1', chip: '#e4e6ee' }
  };
  const vars = (c) => `--mm-fg:${c.fg};--mm-bg:${c.bg};--mm-bd:${c.bd};--mm-chip:${c.chip};--mm-start:${c.start};--mm-end:${c.end}`;
  const cards = [
    { name: 'เช็กชื่อ', desc: 'บันทึกและตรวจสอบการเข้าเรียนของนักเรียน', icon: 'bi-calendar-check', art: 'bi-graph-up-arrow', color: 'blue', page: 'attendance_daily' },
    { name: 'คะแนน', desc: 'จัดการคะแนนและผลการเรียนของนักเรียน', icon: 'bi-table', art: 'bi-graph-up-arrow', color: 'teal', page: 'score_table_viewer' },
    { name: 'ประเมิน', desc: 'ประเมินผลการเรียนรู้และคุณลักษณะอันพึงประสงค์', icon: 'bi-star-fill', art: 'bi-star-fill', color: 'rose', section: 'assessment' },
    { name: 'นักเรียน', desc: 'ข้อมูลนักเรียน รายชั้น/ห้อง และสถิติ', icon: 'bi-mortarboard-fill', art: 'bi-people-fill', color: 'violet', page: 'studentList' },
    { name: 'เอกสาร', desc: 'ดาวน์โหลดเอกสาร / แบบฟอร์มที่เกี่ยวข้อง', icon: 'bi-printer-fill', art: 'bi-file-earmark-text-fill', color: 'purple', section: 'reports' },
    { name: 'เพิ่มเติม', desc: 'เครื่องมือพิเศษ / เมนูอื่น ๆ ที่เกี่ยวข้อง', icon: 'bi-grid-fill', art: 'bi-gear-fill', color: 'slate', tab: 'shortcuts' }
  ];
  const attr = (c) => c.page ? `data-mm-page="${c.page}"` : c.tab ? `data-mm-tab="${c.tab}"` : `data-mm-section="${c.section}"`;

  const panel = document.createElement('div');
  panel.id = 'pp5HubMainMenu';
  panel.className = 'pp5-mm-panel';
  panel.innerHTML =
    '<div class="pp5-mm-head"><h2 class="pp5-mm-title"><i class="bi bi-grid-fill"></i>เมนูหลัก</h2>' +
    '<span class="pp5-mm-hint">เลือกใช้งานได้ตามความต้องการ <i class="bi bi-chevron-right" aria-hidden="true"></i></span><button type="button" class="pp5-mm-all" data-mm-tab="shortcuts">เพิ่มเติม ›</button></div>' +
    '<div class="pp5-hub-tabs" id="pp5HubTabs" role="tablist" aria-label="หมวดเมนู"></div>' +
    '<div data-tab-pane="shortcuts" role="tabpanel"><div class="pp5-mm-cats" id="pp5HubCategories"></div></div>' +
    '<div data-tab-pane="main" role="tabpanel">' +
    '<div class="pp5-mm-grid">' + cards.map((c) =>
      `<button type="button" class="pp5-mm-card${c.hero ? ' is-hero' : ''}" title="${c.desc}" style="${vars(palette[c.color])}" ${attr(c)}>` +
      `<span class="pp5-mm-icon"><i class="bi ${c.icon}"></i></span>` +
      `<span class="pp5-mm-foot"><span><span class="pp5-mm-name">${c.name}</span><span class="pp5-mm-desc">${c.desc}</span></span><span class="pp5-mm-arrow">›</span></span>` +
      `<span class="pp5-mm-art" aria-hidden="true"><i class="bi ${c.art}"></i></span>` +
      '</button>').join('') + '</div></div>';

  // Keep every old route: move cards that exist only in the quick grid
  // (e.g. ภาพรวมสถิติ) into the reports section before hiding the quick grid.
  const quick = hubPage.querySelector('.hub-section[data-section="quick"]');
  const reportsGrid = hubPage.querySelector('.hub-section[data-section="reports"] .hub-grid');
  if (quick) {
    const elsewhere = new Set(Array.from(hubPage.querySelectorAll('.hub-section:not([data-section="quick"]) .hub-card[data-page]')).map((el) => el.getAttribute('data-page')));
    Array.from(quick.querySelectorAll('.hub-card[data-page]')).forEach((card) => {
      const page = card.getAttribute('data-page');
      const roles = String(card.getAttribute('data-roles') || '');
      if (!elsewhere.has(page) && reportsGrid && /admin|teacher/.test(roles)) reportsGrid.appendChild(card);
    });
    quick.classList.add('pp5-mm-replaced');
  }

  const welcome = hubPage.querySelector('.hub-welcome');
  if (welcome && welcome.parentNode === hubPage) hubPage.insertBefore(panel, welcome.nextSibling);
  else hubPage.insertBefore(panel, hubPage.firstChild);

  // Category chips: one per visible section, counted from the cards this role can see.
  const catMeta = {
    students: { icon: 'bi-people-fill', color: 'blue', desc: 'ข้อมูลนักเรียนและห้องเรียน' },
    attendance: { icon: 'bi-calendar-check', color: 'teal', desc: 'บันทึกและตรวจสอบการมาเรียน' },
    scores: { icon: 'bi-table', color: 'purple', tab: 'คะแนน', desc: 'คะแนนรายวิชาและผลการเรียน' },
    assessment: { icon: 'bi-star-fill', color: 'rose', desc: 'ประเมินผลและคุณลักษณะ' },
    reports: { icon: 'bi-printer-fill', color: 'orange', tab: 'เอกสาร/รายงาน', desc: 'พิมพ์เอกสารและรายงาน' },
    settings: { icon: 'bi-sliders', color: 'sky', tab: 'ตั้งค่า/ดูแลระบบ', desc: 'เครื่องมือและการตั้งค่าระบบ' }
  };
  // Tabs: เมนูหลัก, ทางลัด, then one tab per visible section. Only the active tab's
  // content is shown; sections are hidden by class (never removed) so every route stays.
  const sectionInfo = () => Array.from(hubPage.querySelectorAll('.hub-section[data-section]')).map((section) => {
    const key = section.getAttribute('data-section');
    // pp5-tab-off is our own tab hiding; any other display:none means the role cannot see it.
    if (!catMeta[key] || (!section.classList.contains('pp5-tab-off') && getComputedStyle(section).display === 'none')) return null;
    const count = Array.from(section.querySelectorAll('.hub-card')).filter((c) => !c.classList.contains('is-hidden') && c.style.display !== 'none' && getComputedStyle(c).display !== 'none').length;
    if (!count) return null;
    const titleEl = section.querySelector('.hub-section-title');
    const title = (titleEl ? Array.from(titleEl.childNodes).filter((node) => !(node.classList && node.classList.contains('pp5-sec-toggle'))).map((node) => node.textContent).join('') : key).trim() || key;
    return { key, section, count, title };
  }).filter(Boolean);
  let activeTab = 'main';
  const tabBar = panel.querySelector('#pp5HubTabs');
  const setActiveTab = (key, remember) => {
    if (remember && search && String(search.value || '').trim()) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const keys = Array.from(tabBar.querySelectorAll('[data-hub-tab]')).map((b) => b.getAttribute('data-hub-tab'));
    activeTab = keys.includes(key) ? key : 'main';
    hubPage.setAttribute('data-hub-view', activeTab);
    const back = panel.querySelector('.pp5-mm-all');
    back.textContent = activeTab === 'main' ? 'เพิ่มเติม ›' : '‹ เมนูหลัก';
    back.setAttribute('data-mm-tab', activeTab === 'main' ? 'shortcuts' : 'main');
    const heading = panel.querySelector('.pp5-mm-title');
    const selected = tabBar.querySelector(`[data-hub-tab="${activeTab}"]`);
    heading.textContent = selected?.textContent || 'เมนูหลัก';
    tabBar.querySelectorAll('[data-hub-tab]').forEach((b) => {
      const on = b.getAttribute('data-hub-tab') === activeTab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && remember) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    panel.querySelectorAll('[data-tab-pane]').forEach((pane) => pane.classList.toggle('pp5-tab-off', pane.getAttribute('data-tab-pane') !== activeTab));
    hubPage.querySelectorAll('.hub-section[data-section]').forEach((section) => {
      const key = section.getAttribute('data-section');
      if (!catMeta[key]) return;
      const on = key === activeTab;
      section.classList.toggle('pp5-tab-off', !on);
      // Tabs replace collapsing; an old remembered collapse must not hide a tab or search results.
      setHubSectionCollapsed_(section, false, false);
    });
    if (remember) { try { localStorage.setItem(HUB_ACTIVE_TAB_KEY_, activeTab); } catch (_) {} }
  };
  const renderCategories = () => {
    const box = panel.querySelector('#pp5HubCategories');
    if (!box) return;
    const sections = sectionInfo();
    const html = sections.map(({ key, count, title }) =>
      `<button type="button" class="pp5-mm-cat pp5-menu-tile" style="${vars(palette[catMeta[key].color])}" data-mm-section="${key}"><span class="pp5-mm-icon"><i class="bi ${catMeta[key].icon}"></i></span><span class="pp5-mm-foot"><span><b class="pp5-mm-name">${catMeta[key].tab || title}</b><span class="pp5-mm-desc">${catMeta[key].desc}</span></span><span class="pp5-mm-arrow" aria-hidden="true">›</span></span><span class="pp5-mm-art" aria-hidden="true"><i class="bi ${catMeta[key].icon}"></i></span></button>`
    ).join('');
    box.innerHTML = html;
    box.style.display = html ? '' : 'none';
    tabBar.innerHTML = [
      { key: 'main', title: 'เมนูหลัก', icon: 'bi-grid-fill', color: 'violet' },
      { key: 'shortcuts', title: 'เพิ่มเติม', icon: 'bi-grid-fill', color: 'violet' }
    ].concat(sections.map(({ key, title }) => ({ key, title: catMeta[key].tab || title, full: title, icon: catMeta[key].icon, color: catMeta[key].color })))
      .map((t) => `<button type="button" class="pp5-hub-tab" role="tab" data-hub-tab="${t.key}" title="${t.full || t.title}" style="${vars(palette[t.color])}"><i class="bi ${t.icon}"></i>${t.title}</button>`).join('');
    hubPage.classList.add('pp5-tabs');
    setActiveTab(activeTab, false);
    // Recounting categories must retain the admin history shortcut.
    window.PP5History?.enhanceHomeHub?.(hubPage);
  };
  // Section tabs render inside the menu panel, right under the tab bar. The sections are
  // moved (not copied or removed) so their cards, roles and click handlers stay intact.
  const tabSections = document.createElement('div');
  tabSections.className = 'pp5-hub-tab-sections';
  panel.appendChild(tabSections);
  const overview = document.createElement('div');
  overview.className = 'pp5-home-overview-link';
  overview.innerHTML = '<button type="button" class="btn btn-link" data-mm-page="dashboard"><i class="bi bi-bar-chart-line me-1"></i>ภาพรวมโรงเรียน</button>';
  panel.appendChild(overview);
  hubPage.querySelectorAll('.hub-section[data-section]').forEach((section) => {
    if (catMeta[section.getAttribute('data-section')]) tabSections.appendChild(section);
  });
  // Keep the existing buttons and handlers, sharing the main menu's visual treatment.
  const decorateMenuTiles = () => {
    panel.querySelectorAll('.hub-card,[data-history-link]').forEach((button) => {
      if (button.classList.contains('pp5-menu-tile')) return;
      const history = button.hasAttribute('data-history-link');
      const section = button.closest('[data-section]')?.getAttribute('data-section');
      const color = history ? 'violet' : (catMeta[section]?.color || 'slate');
      button.style.cssText += ';' + vars(palette[color]);
      const icon = button.querySelector('.hub-card-icon') || button.querySelector('i');
      const label = button.querySelector('.hub-card-label');
      const name = label?.textContent || button.textContent.trim();
      const artIcon = icon?.querySelector('i')?.className || (icon?.tagName === 'I' ? icon.className : 'bi bi-grid-fill');
      if (history) {
        Array.from(button.childNodes).filter((node) => node.nodeType === 3).forEach((node) => node.remove());
      }
      if (icon) icon.classList.add('pp5-mm-icon');
      const foot = document.createElement('span');
      foot.className = 'pp5-mm-foot';
      if (label) { label.classList.add('pp5-mm-name'); foot.appendChild(label); }
      else { const text = document.createElement('span'); text.className = 'pp5-mm-name'; text.textContent = name; foot.appendChild(text); }
      const arrow = document.createElement('span');
      arrow.className = 'pp5-mm-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '›';
      foot.appendChild(arrow);
      button.appendChild(foot);
      const art = document.createElement('span'); art.className = 'pp5-mm-art'; art.setAttribute('aria-hidden', 'true');
      const artGlyph = document.createElement('i'); artGlyph.className = artIcon; art.appendChild(artGlyph); button.appendChild(art);
      button.classList.add('pp5-menu-tile');
    });
  };
  new MutationObserver(decorateMenuTiles).observe(panel, { childList: true, subtree: true });
  decorateMenuTiles();
  // The search box sits above the menu panel, since search results now appear inside it.
  const searchWrap = hubPage.querySelector('.hub-search-wrap');
  if (searchWrap && searchWrap.parentNode === hubPage) hubPage.insertBefore(searchWrap, panel);
  const search = hubPage.querySelector('#hubMenuSearch');
  if (search) {
    // While searching, results from every section are shown regardless of the active tab.
    // Clearing the search: the page's applyHubRoles_ only ever adds is-hidden, so cards a
    // search hid would stay hidden; restore every card this role may see.
    const syncSearch = () => {
      const searching = !!String(search.value || '').trim();
      hubPage.classList.toggle('pp5-tab-search', searching);
      if (searching) {
        panel.querySelector('.pp5-mm-title').textContent = 'ผลการค้นหา';
        const back = panel.querySelector('.pp5-mm-all');
        back.textContent = '‹ เมนูหลัก';
        back.setAttribute('data-mm-tab', 'main');
        return;
      }
      setActiveTab(activeTab, false);
      hubPage.querySelectorAll('.hub-card[data-roles]').forEach((card) => {
        const roles = String(card.getAttribute('data-roles') || '').split(',').map((r) => r.trim());
        if (roles.includes(role)) card.classList.remove('is-hidden');
      });
      hubPage.querySelectorAll('.hub-section').forEach((section) => {
        const any = Array.from(section.querySelectorAll('.hub-card')).some((c) => !c.classList.contains('is-hidden') && c.style.display !== 'none');
        section.classList.toggle('is-empty', !any);
      });
    };
    search.addEventListener('input', syncSearch);
    search.addEventListener('search', syncSearch);
    syncSearch();
  }
  enhanceHubSectionToggles_(hubPage);
  renderCategories();
  // Role filtering in the page script can finish after this runs; recount once more.
  setTimeout(renderCategories, 600);

  tabBar.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(tabBar.querySelectorAll('[data-hub-tab]'));
    const i = tabs.findIndex((b) => b.getAttribute('data-hub-tab') === activeTab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    setActiveTab(tabs[next].getAttribute('data-hub-tab'), true);
    tabs[next].focus();
  });
  panel.addEventListener('click', (event) => {
    const jump = event.target.closest('[data-mm-tab]');
    if (jump) { setActiveTab(jump.getAttribute('data-mm-tab'), true); return; }
    const tab = event.target.closest('[data-hub-tab]');
    if (tab) { setActiveTab(tab.getAttribute('data-hub-tab'), true); return; }
    const target = event.target.closest('[data-mm-page],[data-mm-section]');
    if (!target) return;
    const page = target.getAttribute('data-mm-page');
    if (page) {
      if (typeof window.navigateTo === 'function') window.navigateTo(page);
      return;
    }
    const key = target.getAttribute('data-mm-section');
    const section = hubPage.querySelector(`.hub-section[data-section="${key}"]`);
    if (!section) return;
    setActiveTab(key, true);
    section.classList.remove('pp5-mm-flash');
    void section.offsetWidth;
    section.classList.add('pp5-mm-flash');
  });
}

// หน้า Smart Dashboard: เอา "เข้าถึงด่วน" ออก เพราะทั้ง 8 ปุ่มมีอยู่แล้วในหน้าหลัก
// (score_table_viewer, attendance_daily, read_think_write_form, export_reports,
//  studentList, pp5_full_book, student_scores_summary, holiday_form)
function enhanceSupabaseDashboardPage_() {
  const frame = document.getElementById('contentFrame');
  if (!frame) return;
  enhanceDashboardLayout_(frame);
  const actions = frame.querySelector('.quick-actions');
  if (!actions) return;
  const block = actions.parentElement;
  const heading = block && block.querySelector('h6');
  if (block && heading && /เข้าถึงด่วน/.test(heading.textContent || '')) block.style.display = 'none';
  else actions.style.display = 'none';

  const anchor = block && block.parentNode ? block : actions;
  try { renderDashboardKpis_(frame); } catch (err) { console.warn('kpis failed', err); }
  try { renderDashboardWatchlist_(frame, anchor); } catch (err) { console.warn('watchlist failed', err); }
  const after = () => frame.querySelector('#pp5DashParentAccess') || frame.querySelector('#pp5DashChecks') || frame.querySelector('#pp5DashToday') || frame.querySelector('#pp5DashWatchlist') || anchor;
  try { renderDashboardToday_(frame, after()); } catch (err) { console.warn('today attendance failed', err); }
  try { renderDashboardChecks_(frame, after()); } catch (err) { console.warn('data checks failed', err); }
  // งานที่ยังค้าง วางต่อจากเช็คชื่อวันนี้ (before the data checks)
  try { renderDashboardPending_(frame, frame.querySelector('#pp5DashToday') || after()); } catch (err) { console.warn('pending work failed', err); }
  try { renderDashboardAttendanceChart_(frame); } catch (err) { console.warn('attendance chart failed', err); }
  const role = String(localStorage.getItem('role') || '').toLowerCase();
  if (role === 'admin') { try { renderDashboardParentAccess_(frame, after()); } catch (err) { console.warn('parent access failed', err); } }
}

// ---------- ภาพรวมโรงเรียน รอบ 3 (owner 2026-10-08) ----------
// บรรทัดเดียวแทนส่วนที่ซ่อนเพราะยังไม่มีข้อมูล (ต้นภาค)
function dashEmptyNote_(page, id, target, html) {
  let note = page.querySelector('#' + id);
  if (!note) {
    note = document.createElement('div');
    note.id = id;
    note.className = 'pp5-dash-empty-note';
    target.before(note);
  }
  note.innerHTML = '<i class="bi bi-hourglass-split" aria-hidden="true"></i><span>' + html + '</span>';
  note.hidden = false;
}

// ต้นภาคยังไม่มีวิชาไหนกรอกคะแนนครบถึงปลายภาค: "คะแนนเฉลี่ยรายชั้น" + "สัดส่วนเกรด" เหลือแต่ "-" และกราฟว่าง
// จึงซ่อนทั้งแถว เหลือบรรทัดเดียวบอกว่าจะแสดงเมื่อไร  สคริปต์ของหน้าเขียน #academicAvgScore (เมื่อมีข้อมูล)
// ก่อนซ่อน #academicLoading1 ทั้งตอนสำเร็จและล้มเหลว จึงตัดสินตอนที่ตัวโหลดหายไป และตามดูต่อ (ปุ่มรีเฟรชโหลดใหม่)
function hideEmptyDashboardCharts_(page) {
  const loading = page.querySelector('#academicLoading1');
  const avg = page.querySelector('#academicAvgScore');
  const row = page.querySelector('#academicSection')?.closest('.row');
  if (!loading || !avg || !row || row.dataset.pp5EmptyWatch) return;
  row.dataset.pp5EmptyWatch = '1';
  const check = () => {
    if (loading.style.display !== 'none') return;
    const empty = !/[0-9]/.test(avg.textContent || '');
    row.hidden = empty;
    if (empty) dashEmptyNote_(page, 'pp5DashChartsEmpty', row, '<b>คะแนนเฉลี่ยและสัดส่วนเกรด</b> จะแสดงเมื่อมีวิชาที่กรอกคะแนนครบถึงปลายภาคแล้ว');
    else { const note = page.querySelector('#pp5DashChartsEmpty'); if (note) note.hidden = true; }
  };
  check();
  if (typeof MutationObserver === 'function') new MutationObserver(check).observe(loading, { attributes: true, attributeFilter: ['style'] });
}

// ครูประจำชั้นเห็นเฉพาะห้องตัวเอง (bridge: dashboardScope_ / dashboardCardStudents_) ป้ายเดิมของหน้า
// "ข้อมูลรวมทุกระดับชั้น" จึงต้องบอกว่าเป็นห้องไหน
function dashScopeLabels_(frame, res) {
  if (!res || res.scope !== 'class' || !res.scopeLabel) return;
  const label = 'ห้อง ' + res.scopeLabel;
  frame.querySelectorAll('.pp5-dashboard .mt-3.text-center.text-muted.small').forEach((el) => {
    if (/ข้อมูลรวมทุกระดับชั้น/.test(el.textContent || '')) el.textContent = '* ข้อมูลเฉพาะ' + label;
  });
  const badge = frame.querySelector('#academicSection .badge');
  if (badge) badge.textContent = label + ' · ปีการศึกษาปัจจุบัน';
  const tools = frame.querySelector('.pp5-dash-tools');
  if (tools && !tools.querySelector('.pp5-dash-scope')) {
    const chip = document.createElement('span');
    chip.className = 'pp5-dash-scope';
    chip.innerHTML = '<i class="bi bi-door-open" aria-hidden="true"></i> แสดงเฉพาะ' + escapeHtml_(label);
    tools.prepend(chip);
  }
}

function printDashboardSummary_(button) {
  if (!(window.google && google.script && google.script.run)) return;
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> กำลังสร้าง PDF';
  const restore = () => { button.disabled = false; button.innerHTML = original; };
  google.script.run
    .withSuccessHandler((res) => {
      restore();
      if (!res || !res.url) return;
      const link = document.createElement('a');
      link.href = res.url;
      link.download = res.fileName || 'dashboard-summary.pdf';
      link.click();
    })
    .withFailureHandler((error) => {
      restore();
      const message = '❌ สร้าง PDF ไม่สำเร็จ: ' + (error && error.message || error);
      if (typeof window.showToast === 'function') window.showToast(message, false);
      else console.error(message);
    })
    .generateDashboardSummaryPdf();
}

// Compact school header and an expandable room summary below the six main actions.
function enhanceHomeCompactLayout_(hubPage, card) {
  hubPage.classList.add('pp5-home-compact');
  // Move the original live year/count elements beside search; their loaders keep working.
  const search = hubPage.querySelector('.hub-search-wrap');
  const stats = hubPage.querySelector('.hub-stats');
  if (search && stats && !hubPage.querySelector('.pp5-home-toolbar')) {
    const toolbar = document.createElement('div');
    toolbar.className = 'pp5-home-toolbar';
    search.before(toolbar);
    toolbar.append(search, stats);
  }
  const header = card.querySelector('.roadmap-header');
  const percent = card.querySelector('#rmPercentPill');
  const pills = card.querySelector('#rmPillsBar');
  const details = document.createElement('details');
  details.className = 'pp5-room-details';
  details.open = true;
  const summary = document.createElement('summary');
  summary.className = 'pp5-room-summary';
  summary.innerHTML = '<strong><i class="bi bi-bar-chart-fill" aria-hidden="true"></i>ห้องของฉัน</strong><label class="pp5-room-picker"><span class="visually-hidden">เลือกห้องเรียน</span><select class="form-select form-select-sm" aria-label="เลือกห้องเรียน"></select></label><span class="pp5-room-progress">ความพร้อม </span><span class="pp5-room-expand">ย่อรายละเอียด <i class="bi bi-chevron-down"></i></span>';
  if (percent) summary.querySelector('.pp5-room-progress').appendChild(percent);
  const meter = document.createElement('span');
  meter.className = 'pp5-room-meter';
  meter.setAttribute('aria-hidden', 'true');
  meter.innerHTML = '<span></span>';
  summary.querySelector('.pp5-room-progress').appendChild(meter);
  if (percent) {
    const syncMeter = () => { meter.firstElementChild.style.width = Math.max(0, Math.min(100, parseFloat(percent.textContent) || 0)) + '%'; };
    new MutationObserver(syncMeter).observe(percent, { childList: true, characterData: true, subtree: true });
    syncMeter();
  }
  const select = summary.querySelector('select');
  if (pills) {
    // ตัวเลือกห้อง = ปุ่มห้องในแผง (ชั้น|ห้อง) สร้างใหม่ทุกครั้งที่ปุ่มเปลี่ยน (ห้องจริงโหลดตามมาทีหลัง)
    const syncRoomSelect = () => {
      select.innerHTML = '';
      pills.querySelectorAll('[data-grade]').forEach((pill) => {
        const option = document.createElement('option');
        const room = pill.getAttribute('data-room') || '1';
        option.value = pill.getAttribute('data-grade') + '|' + room;
        option.textContent = pill.getAttribute('data-grade') + '/' + room;
        option.selected = pill.classList.contains('active');
        select.appendChild(option);
      });
    };
    syncRoomSelect();
    card.__pp5SyncRoomSelect = syncRoomSelect;
    select.addEventListener('change', () => {
      const [grade, room] = select.value.split('|');
      const target = Array.from(pills.querySelectorAll('[data-grade]')).find((pill) => pill.getAttribute('data-grade') === grade && (pill.getAttribute('data-room') || '1') === room);
      if (percent) percent.textContent = '…';
      target?.click();
    });
  }
  // A click/keypress in the room picker must not also fold the native details.
  summary.querySelector('label').addEventListener('click', (event) => event.stopPropagation());
  select.addEventListener('keydown', (event) => event.stopPropagation());
  const tools = document.createElement('div');
  tools.className = 'pp5-room-tools';
  tools.setAttribute('aria-label', 'เครื่องมือครู');
  for (const id of ['btnRoadmapTeacherSig', 'btnRoadmapSarAnalytics', 'btnRoadmapHealthDoctor']) {
    const button = card.querySelector('#' + id);
    if (button) tools.appendChild(button);
  }
  details.appendChild(summary);
  if (header) details.appendChild(header);
  for (const selector of ['#rmSummaryStrip', '.roadmap-pipeline-wrap', '#rmDrawer']) {
    const section = card.querySelector(selector);
    if (section) details.appendChild(section);
  }
  details.appendChild(tools);
  card.appendChild(details);
  details.addEventListener('toggle', () => {
    summary.querySelector('.pp5-room-expand').innerHTML = (details.open ? 'ย่อรายละเอียด' : 'ดูรายละเอียด') + ' <i class="bi bi-chevron-down"></i>';
  });
  const menu = hubPage.querySelector('#pp5HubMainMenu');
  if (menu) menu.after(card);
  else hubPage.appendChild(card);
}

// Keep the original data containers and loaders; only the presentation folds.
function enhanceDashboardLayout_(frame) {
  const page = frame.querySelector('.dashboard-title')?.closest('.container-fluid');
  if (!page) return;
  page.classList.add('pp5-dashboard');
  const title = page.querySelector('.dashboard-title');
  if (title) title.innerHTML = '<i class="bi bi-bar-chart-line me-2"></i>ภาพรวมโรงเรียน';
  // หัวหน้าเป็นแถบแบนเนอร์ (js/page-banner.js) แล้ว แถวนี้เหลือแค่ปุ่ม: ชิดขวา และ "ล้าง Cache" เป็นปุ่มไอคอนเล็ก
  // (ปุ่มเทคนิคที่ครูทั่วไปไม่ต้องใช้ ไม่ควรเด่นเป็นสีแดง) id และการทำงานเดิมคงไว้
  title?.closest('.justify-content-between')?.classList.add('pp5-dash-tools');
  const clearCache = page.querySelector('#clearCache');
  if (clearCache && !clearCache.dataset.pp5Slim) {
    clearCache.dataset.pp5Slim = '1';
    clearCache.classList.remove('text-danger');
    clearCache.classList.add('pp5-dash-slim');
    clearCache.title = 'ล้างข้อมูลที่จำไว้ในเครื่อง แล้วโหลดใหม่ (ใช้เมื่อตัวเลขดูไม่ตรง)';
    clearCache.setAttribute('aria-label', 'ล้างข้อมูลที่จำไว้ในเครื่อง');
    const slim = '<i class="bi bi-eraser"></i>';
    clearCache.innerHTML = slim;
    // สคริปต์ของหน้าเดิมใส่ข้อความ "ล้าง Cache" กลับหลังทำเสร็จ: ย่อกลับเป็นไอคอน
    if (typeof MutationObserver === 'function') {
      new MutationObserver(() => {
        if (/ล้าง Cache/.test(clearCache.textContent || '')) clearCache.innerHTML = slim;
      }).observe(clearCache, { childList: true, characterData: true, subtree: true });
    }
  }
  // รอบ 3 (owner 2026-10-08): ปุ่ม "พิมพ์สรุป 1 หน้า" ก่อนปุ่มรีเฟรช
  const refresh = page.querySelector('#refreshDashboard');
  if (refresh && !page.querySelector('#pp5DashPrint')) {
    const print = document.createElement('button');
    print.type = 'button';
    print.id = 'pp5DashPrint';
    print.className = 'btn btn-glass';
    print.title = 'สรุปตัวเลขในหน้านี้เป็นไฟล์ PDF 1 หน้า (ใช้รายงานหรือติดบอร์ด)';
    print.innerHTML = '<i class="bi bi-printer"></i> พิมพ์สรุป 1 หน้า';
    print.addEventListener('click', () => printDashboardSummary_(print));
    refresh.before(print);
  }
  hideEmptyDashboardCharts_(page);
  for (const [selector, key, defaultClosed] of [
    ['.grade-chart-card', 'pp5DashGradeDetails', true],
    ['.progress-card', 'pp5DashProgressDetails', false]
  ]) {
    const card = page.querySelector(selector);
    const heading = card?.querySelector('h6');
    if (!heading || heading.querySelector('button')) continue;
    const body = heading.nextElementSibling;
    if (!body) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pp5-overview-fold';
    button.innerHTML = heading.innerHTML + '<span class="pp5-overview-fold-label"></span><i class="bi bi-chevron-down"></i>';
    heading.replaceChildren(button);
    button.setAttribute('aria-controls', body.id);
    const setClosed = (closed) => {
      body.hidden = closed;
      button.setAttribute('aria-expanded', String(!closed));
      button.querySelector('.pp5-overview-fold-label').textContent = closed ? 'แสดงรายละเอียด' : 'ย่อ';
    };
    let closed = defaultClosed;
    try { const saved = localStorage.getItem(key); if (saved !== null) closed = saved === '1'; } catch (_) {}
    setClosed(closed);
    button.addEventListener('click', () => {
      setClosed(!body.hidden);
      try { localStorage.setItem(key, body.hidden ? '1' : '0'); } catch (_) {}
    });
  }
}

// "สถิติการเข้าเรียน": แคนวาสของหน้าเดิม (#attendanceChart) ไม่เคยถูกวาดกราฟจริง — แทนด้วยแถวรายชั้น
// (แท่งสัดส่วน มา/ลา/ขาด เต็ม 100% + เส้นเกณฑ์ 80% + ตัวเลขชัด) เพราะทุกชั้นอยู่ราว 96-100%
// กราฟแท่งแนวตั้งเริ่มที่ 0 จึงดูเท่ากันหมด โดยไม่แก้ไฟล์หน้าเดิม
function renderDashboardAttendanceChart_(frame) {
  const canvas = frame.querySelector('#attendanceChart');
  if (!canvas || canvas._pp5Done) return;
  canvas._pp5Done = true;
  if (!(window.google && google.script && google.script.run)) return;
  ensureDashStyles_(frame);
  const box = canvas.parentElement;
  const fmt = (n) => Number(n || 0).toLocaleString('th-TH');
  const pctOf = (n, total) => (total ? (n / total) * 100 : 0);
  // ซ่อนกล่องแคนวาสเดิมแทนการลบ: สคริปต์หน้าเดิมยังเรียก #attendanceLoading อยู่
  const show = (inner) => {
    let out = frame.querySelector('#pp5AttRows');
    if (!out) {
      out = document.createElement('div');
      out.id = 'pp5AttRows';
      box.parentNode.insertBefore(out, box.nextSibling);
    }
    box.style.display = 'none';
    out.innerHTML = inner;
  };
  google.script.run
    .withSuccessHandler((res) => {
      const yearly = (res && res.attendance && res.attendance.yearlyByGrade) || {};
      const grades = Object.keys(yearly);
      if (!grades.some((g) => yearly[g] && yearly[g].totalDays > 0)) {
        show('<div class="text-center text-muted py-4"><i class="bi bi-info-circle me-2"></i>ยังไม่มีข้อมูลการเช็คชื่อ</div>');
        // รอบ 3: ทั้งกล่องมีแต่ 0 และ "-": ซ่อน เหลือบรรทัดเดียว
        const section = frame.querySelector('#attendanceSection');
        if (section) {
          section.hidden = true;
          dashEmptyNote_(frame, 'pp5DashAttEmpty', section, '<b>สถิติการเข้าเรียนทั้งปี</b> จะแสดงเมื่อเริ่มเช็คชื่อแล้ว');
        }
        return;
      }
      let html = '<div class="pp5-att-legend"><span><i class="pp5-att-key is-present"></i>มา</span><span><i class="pp5-att-key is-leave"></i>ลา</span>'
        + '<span><i class="pp5-att-key is-absent"></i>ขาด</span><span><i class="pp5-att-key is-goal"></i>เกณฑ์ 80%</span></div>';
      grades.forEach((g) => {
        const y = yearly[g] || {};
        const total = y.totalDays || 0;
        html += '<div class="pp5-att-row"><div class="pp5-att-grade">' + escapeHtml_(g) + '</div>';
        if (!total) {
          html += '<div class="pp5-att-main"><div class="pp5-att-track is-empty"></div><div class="pp5-att-sub">ยังไม่มีข้อมูลเช็คชื่อ</div></div><div class="pp5-att-pct is-none">–</div></div>';
          return;
        }
        const seg = (cls, n, label) => (n ? '<span class="pp5-att-seg ' + cls + '" style="width:' + pctOf(n, total).toFixed(2) + '%" title="' + label + ' ' + fmt(n) + ' ครั้ง (' + pctOf(n, total).toFixed(1) + '%)"></span>' : '');
        const rate = Number(y.attendanceRate || 0);
        const low = rate < 80;
        html += '<div class="pp5-att-main"><div class="pp5-att-track">'
          + seg('is-present', y.totalPresent, 'มา') + seg('is-leave', y.totalLeave, 'ลา') + seg('is-absent', y.totalAbsent, 'ขาด')
          + '<i class="pp5-att-goal" title="เกณฑ์ 80%"></i></div>'
          + '<div class="pp5-att-sub">มา ' + fmt(y.totalPresent) + ' · ลา ' + fmt(y.totalLeave) + ' · ขาด ' + fmt(y.totalAbsent) + ' ครั้ง</div></div>'
          + '<div class="pp5-att-pct' + (low ? ' is-low' : '') + '">' + (low ? '<i class="bi bi-exclamation-triangle-fill me-1"></i>' : '') + rate.toFixed(1) + '%</div></div>';
      });
      show('<div class="pp5-att">' + html + '</div>');
    })
    .withFailureHandler(() => {})
    .getCachedDashboardSummary(localStorage.getItem('authToken') || '');
}

function ensureDashStyles_(frame) {
  if (!document.getElementById('pp5DashWatchStyles')) {
    const style = document.createElement('style');
    style.id = 'pp5DashWatchStyles';
    style.textContent = [
      '.pp5-dw{background:#fff;border-radius:20px;padding:18px 20px;margin-bottom:1.5rem;box-shadow:0 6px 24px rgba(30,27,58,.06)}',
      '.pp5-dw-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer;user-select:none}',
      '.pp5-dw-head h6{margin:0;font-weight:700;color:#1e1b3a;display:flex;align-items:center;gap:8px}',
      '.pp5-dw-head h6 i{width:30px;height:30px;border-radius:9px;background:#fff1e6;color:#ea580c;display:inline-flex;align-items:center;justify-content:center}',
      '.pp5-dw-meta{font-size:.8rem;color:#64748b}',
      '.pp5-dw-toggle{margin-left:auto;padding:3px 10px;border-radius:999px;background:#eef0ff;color:var(--primary);font-size:.8rem;font-weight:600;display:inline-flex;align-items:center;gap:4px}',
      '.pp5-dw-toggle i{transition:transform .2s ease;font-size:.75rem}',
      '.pp5-dw.is-collapsed .pp5-dw-toggle i{transform:rotate(-90deg)}',
      '.pp5-dw.is-collapsed .pp5-dw-body{display:none}',
      '.pp5-dw-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}',
      '.pp5-dw-stat{border-radius:14px;padding:10px 14px;background:var(--dw-bg);color:var(--dw-fg)}',
      '.pp5-dw-stat b{display:block;font-size:1.4rem;line-height:1.2}',
      '.pp5-dw-stat span{font-size:.8rem}',
      '.pp5-dw-class{border:1px solid #eceef5;border-radius:14px;margin-top:10px;overflow:hidden}',
      '.pp5-dw-class-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;background:#f8f9fc}',
      '.pp5-dw-class-head b{color:#1e1b3a}',
      '.pp5-dw-class-head .pp5-dw-actions{margin-left:auto;display:flex;gap:6px}',
      '.pp5-dw-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr))}',
      '.pp5-dw-row{display:flex;gap:10px;align-items:center;padding:8px 14px;border-top:1px solid #f0f1f6}',
      '.pp5-dw-row[hidden]{display:none}',
      '.pp5-dw-name{flex:0 1 170px;min-width:0;font-weight:600;color:#1e1b3a;font-size:.9rem}',
      '.pp5-dw-name small{display:block;font-weight:400;color:#64748b}',
      '.pp5-dw-tags{display:flex;flex-wrap:wrap;gap:4px;flex:1 1 140px;min-width:0}',
      '.pp5-dw-list .pp5-dw-tag{white-space:normal}',
      '.pp5-dw-tag{font-size:.78rem;padding:3px 9px;border-radius:999px;background:var(--dw-bg);color:var(--dw-fg);white-space:nowrap}',
      '.pp5-dw-more{border:none;background:none;color:var(--primary);font-weight:600;font-size:.85rem;padding:8px 14px;cursor:pointer}',
      '.pp5-dw-empty{padding:18px;text-align:center;color:#15803d;background:#f0fdf4;border-radius:14px;margin-top:12px}',
      '.pp5-dw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-top:12px}',
      '.pp5-dw-tile{border:1px solid #eceef5;border-radius:14px;padding:10px 12px;background:#fff;text-align:left;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;gap:4px}',
      '.pp5-dw-tile:hover{border-color:color-mix(in srgb, var(--primary-light) 30%, #fff);background:#f8f9ff}',
      '.pp5-dw-tile b{color:#1e1b3a}',
      '.pp5-dw-tile small{color:#64748b}',
      '.pp5-dw-badge{align-self:flex-start;font-size:.72rem;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--dw-bg);color:var(--dw-fg)}',
      '.pp5-dw-note{font-size:.8rem;color:#92400e;background:#fffbeb;border-radius:10px;padding:6px 10px;margin-top:10px}',
      '.pp5-dw-check{display:flex;gap:12px;align-items:flex-start;padding:10px 4px;border-top:1px solid #f0f1f6}',
      '.pp5-dw-check:first-child{border-top:none}',
      '.pp5-dw-check > i{font-size:1.15rem;margin-top:2px}',
      '.pp5-dw-check .pp5-dw-check-text{flex:1}',
      '.pp5-dw-check .pp5-dw-check-text b{display:block;color:#1e1b3a}',
      '.pp5-dw-check .pp5-dw-check-text small{display:block;color:#64748b}',
      '.pp5-dw-groups{display:flex;flex-direction:column;gap:6px;margin-top:8px}',
      '.pp5-dw-group{border:1px solid #e5e7f0;border-radius:10px;padding:8px 10px;background:#fafbff}',
      '.pp5-dw-group-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;font-size:.86rem;color:#1e1b3a}',
      '.pp5-dw-group-head b{display:inline !important}',
      '.pp5-dw-check .pp5-dw-check-text small.pp5-dw-group-warn{color:#b45309;margin-top:4px}',
      '.pp5-dw-group-names{margin-top:4px}',
      '.pp5-dw-group-names summary{cursor:pointer;font-size:.8rem;color:var(--primary);width:max-content}',
      '[data-theme="dark"] .pp5-dw-group{background:#23273a;border-color:#2e3348}',
      '[data-theme="dark"] .pp5-dw-group-head{color:#e5e7f5}',
      '[data-theme="dark"] .pp5-dw-group-names summary{color:color-mix(in srgb, var(--primary-light) 50%, #fff)}',
      '[data-theme="dark"] .pp5-dw-tile{background:#23273a;border-color:#2e3348}',
      '[data-theme="dark"] .pp5-dw-tile b,[data-theme="dark"] .pp5-dw-check-text b{color:#e5e7f5}',
      '[data-theme="dark"] .pp5-dw{background:#1e2130}',
      '[data-theme="dark"] .pp5-dw-head h6,[data-theme="dark"] .pp5-dw-name,[data-theme="dark"] .pp5-dw-class-head b{color:#e5e7f5}',
      '[data-theme="dark"] .pp5-dw-class{border-color:#2e3348}',
      '[data-theme="dark"] .pp5-dw-class-head{background:#23273a}',
      '[data-theme="dark"] .pp5-dw-row{border-color:#2e3348}',
      // สถิติการเข้าเรียนรายชั้น
      '.pp5-att{--att-present:#16a34a;--att-leave:#f59e0b;--att-absent:#dc2626;--att-track:#eef1f6;--att-ink:#1e1b3a;--att-muted:#64748b;--att-line:#f0f1f6}',
      '.pp5-att-legend{display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:flex-end;font-size:.78rem;color:var(--att-muted);margin-bottom:4px}',
      '.pp5-att-legend span{display:inline-flex;align-items:center;gap:6px}',
      '.pp5-att-key{display:inline-block;width:10px;height:10px;border-radius:3px}',
      '.pp5-att-key.is-present{background:var(--att-present)}.pp5-att-key.is-leave{background:var(--att-leave)}.pp5-att-key.is-absent{background:var(--att-absent)}',
      '.pp5-att-key.is-goal{width:0;height:12px;border-radius:0;border-left:2px dashed var(--att-muted)}',
      '.pp5-att-row{display:grid;grid-template-columns:52px minmax(0,1fr) 78px;align-items:center;gap:14px;padding:10px 0;border-top:1px solid var(--att-line)}',
      '.pp5-att-row:first-of-type{border-top:0}',
      '.pp5-att-grade{font-weight:700;color:var(--att-ink);text-align:center;background:#eef0ff;border-radius:10px;padding:5px 0}',
      '.pp5-att-main{min-width:0}',
      '.pp5-att-track{position:relative;display:flex;gap:2px;height:12px;border-radius:999px;background:var(--att-track);overflow:hidden}',
      '.pp5-att-track.is-empty{background:repeating-linear-gradient(135deg,var(--att-track) 0 6px,transparent 6px 12px)}',
      '.pp5-att-seg{height:100%;min-width:3px}',
      '.pp5-att-seg:first-child{border-radius:999px 0 0 999px}.pp5-att-seg:last-of-type{border-radius:0 999px 999px 0}',
      '.pp5-att-seg.is-present{background:var(--att-present)}.pp5-att-seg.is-leave{background:var(--att-leave)}.pp5-att-seg.is-absent{background:var(--att-absent)}',
      '.pp5-att-goal{position:absolute;left:80%;top:-2px;bottom:-2px;border-left:2px dashed rgba(255,255,255,.9)}',
      '.pp5-att-sub{font-size:.76rem;color:var(--att-muted);margin-top:5px}',
      '.pp5-att-pct{font-weight:700;font-size:1.05rem;color:var(--att-ink);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.pp5-att-pct.is-low{color:var(--att-absent)}.pp5-att-pct.is-none{color:var(--att-muted);font-weight:400}',
      '@media (max-width:576px){.pp5-att-row{grid-template-columns:42px minmax(0,1fr) 58px;gap:10px}.pp5-att-pct{font-size:.92rem}.pp5-att-legend{justify-content:flex-start}}',
      '[data-theme="dark"] .pp5-att{--att-present:#22c55e;--att-leave:#fbbf24;--att-absent:#f87171;--att-track:#2a2f45;--att-ink:#e5e7f5;--att-muted:#9aa3b8;--att-line:#2e3348}',
      '[data-theme="dark"] .pp5-att-grade{background:#2a2f45}'
    ].join('\n');
    (document.head || frame).appendChild(style);
  }
}

// ส่วนที่ใช้ร่วมกันของการ์ดใน Smart Dashboard: หัวการ์ด + ปุ่มซ่อน/แสดง (จำไว้ต่อเครื่อง)
function dashCard_(frame, anchor, opts) {
  ensureDashStyles_(frame);
  const card = document.createElement('div');
  card.id = opts.id;
  card.className = 'pp5-dw';
  card.innerHTML = '<div class="pp5-dw-head" role="button" tabindex="0" aria-expanded="true">'
    + '<h6><i class="bi ' + opts.icon + '" style="background:' + opts.iconBg + ';color:' + opts.iconFg + '"></i>' + escapeHtml_(opts.title) + '</h6><span class="pp5-dw-meta"></span>'
    + '<span class="pp5-dw-toggle"><span class="pp5-dw-toggle-label">ซ่อน</span><i class="bi bi-chevron-down"></i></span></div>'
    + '<div class="pp5-dw-body">' + (typeof window.loadingHtml === 'function' ? window.loadingHtml('กำลังตรวจสอบ') : 'กำลังตรวจสอบ...') + '</div>';
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling);
  else frame.appendChild(card);
  const head = card.querySelector('.pp5-dw-head');
  const setCollapsed = (collapsed, remember) => {
    card.classList.toggle('is-collapsed', collapsed);
    head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    card.querySelector('.pp5-dw-toggle-label').textContent = collapsed ? 'แสดง' : 'ซ่อน';
    if (remember) { try { localStorage.setItem(opts.storageKey, collapsed ? '1' : '0'); } catch (_) {} }
  };
  let start = false;
  try { start = localStorage.getItem(opts.storageKey) === '1'; } catch (_) {}
  setCollapsed(start, false);
  head.addEventListener('click', () => setCollapsed(!card.classList.contains('is-collapsed'), true));
  head.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setCollapsed(!card.classList.contains('is-collapsed'), true); }
  });
  const body = card.querySelector('.pp5-dw-body');
  body.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-dw-page]');
    if (!nav) return;
    const page = nav.getAttribute('data-dw-page');
    const target = nav.getAttribute('data-dw-scroll');
    // "งานที่ยังค้าง": หน้าปลายทางเลือกชั้น/ห้องนี้ให้เอง (GradeClassHelper จำค่าที่เลือกล่าสุด)
    if (nav.hasAttribute('data-dw-class')) {
      try {
        const cls = JSON.parse(nav.getAttribute('data-dw-class'));
        if (window.GradeClassHelper?.saveSelection) window.GradeClassHelper.saveSelection(cls.grade, cls.room || '1');
      } catch (_) {}
    }
    if (nav.hasAttribute('data-dw-grade') && nav.hasAttribute('data-dw-room')) {
      // GradeClassHelper restores its remembered class on the next page: remember this room too,
      // so it does not switch back to the previously used room after the list loads.
      if (window.GradeClassHelper?.saveSelection) window.GradeClassHelper.saveSelection(nav.getAttribute('data-dw-grade'), nav.getAttribute('data-dw-room'));
      try {
        sessionStorage.setItem('pp5DashboardAttendanceTarget', JSON.stringify({
          grade: nav.getAttribute('data-dw-grade'),
          room: nav.getAttribute('data-dw-room'),
          day: nav.getAttribute('data-dw-day') || ''
        }));
      } catch (_) {}
    }
    // "เปิดวิชานี้" จากการ์ดตรวจคะแนน: ใช้กลไกจำค่าที่หน้ากรอกคะแนนมีอยู่แล้ว (ชั้น/ห้องผ่าน GradeClassHelper,
    // วิชาผ่าน pp5_selected_subject_code) ส่วนภาคเรียน 2 ให้ enhanceSupabaseScoreEntryPage_ สลับแท็บให้
    if (nav.hasAttribute('data-dw-score')) {
      try {
        const scoreTarget = JSON.parse(nav.getAttribute('data-dw-score'));
        if (window.GradeClassHelper?.saveSelection) window.GradeClassHelper.saveSelection(scoreTarget.grade, scoreTarget.room || '1');
        if (scoreTarget.subjectCode) localStorage.setItem('pp5_selected_subject_code', scoreTarget.subjectCode);
        sessionStorage.setItem('pp5DashboardScoreTarget', JSON.stringify(scoreTarget));
      } catch (_) {}
    }
    if (typeof window.navigateTo === 'function') window.navigateTo(page);
    if (target) {
      let tries = 0;
      const timer = setInterval(() => {
        const el = document.getElementById(target);
        if (el || ++tries > 40) { clearInterval(timer); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }, 250);
    }
  });
  return { card, body, meta: card.querySelector('.pp5-dw-meta') };
}

function dashThaiDate_(iso, withDay) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const days = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return (withDay ? days[d.getDay()] + ' ' : '') + Number(m[3]) + ' ' + months[Number(m[2]) - 1] + ' ' + (Number(m[1]) + 543);
}

function dashCall_(body, method, arg, render) {
  if (!(window.google && google.script && google.script.run)) { body.textContent = 'ยังโหลดข้อมูลไม่ได้'; return; }
  const runner = google.script.run
    .withSuccessHandler((res) => { try { render(res || {}); } catch (err) { body.textContent = 'แสดงผลไม่สำเร็จ: ' + (err && err.message || err); } })
    .withFailureHandler((error) => { body.innerHTML = '<div class="text-danger small">' + escapeHtml_(String(error && error.message || error)) + '</div>'; });
  if (arg === undefined) runner[method](); else runner[method](arg);
}

const DASH_TONE_ = {
  done: '--dw-bg:#dcfce7;--dw-fg:#15803d',
  partial: '--dw-bg:#fef3c7;--dw-fg:#92400e',
  none: '--dw-bg:#fee2e2;--dw-fg:#b91c1c',
  prefilled: '--dw-bg:#ffedd5;--dw-fg:#c2410c',
  info: '--dw-bg:#e0f2fe;--dw-fg:#0369a1',
  all: '--dw-bg:#ede9fe;--dw-fg:#5b21b6'
};
const dashStat_ = (value, label, tone) => '<div class="pp5-dw-stat" style="' + DASH_TONE_[tone] + '"><b>' + value + '</b><span>' + label + '</span></div>';

// การ์ด "เช็คชื่อวันนี้รายห้อง"
const DASH_LATE_HOUR_ = 9;
function renderDashboardToday_(frame, anchor) {
  if (!frame || frame.querySelector('#pp5DashToday')) return;
  const { body, meta } = dashCard_(frame, anchor, { id: 'pp5DashToday', icon: 'bi-calendar-check', iconBg: '#dcfce7', iconFg: '#15803d', title: 'เช็คชื่อวันนี้รายห้อง', storageKey: 'pp5DashTodayCollapsed' });
  const labels = { done: 'เช็คครบแล้ว', partial: 'เช็คยังไม่ครบ', none: 'ยังไม่เช็คชื่อ', prefilled: 'กรอกไว้ล่วงหน้า' };
  dashCall_(body, 'getDashboardTodayAttendance', undefined, (res) => {
    const t = res.totals || {};
    meta.textContent = (res.scopeLabel || '') + ' · ' + (res.isToday ? 'วันนี้ ' : 'วันเรียนล่าสุด ') + dashThaiDate_(res.day, true);
    const checkedNow = t.checked || ((t.present || 0) + (t.leave || 0) + (t.absent || 0));
    const presentPct = dashPct_(t.present || 0, checkedNow);
    dashKpiSet_('attendance', checkedNow ? presentPct + '%' : '-',
      (res.isToday ? '' : 'วันเรียนล่าสุด · ') + 'มา ' + (t.present || 0) + ' จาก ' + checkedNow + ' คน · เช็คแล้ว ' + (t.classesDone || 0) + '/' + (t.classes || 0) + ' ห้อง',
      presentPct, presentPct >= 95 ? 'done' : presentPct >= 80 ? 'partial' : 'low');
    let html = '<div class="pp5-dw-sum">'
      + dashStat_((t.classesDone || 0) + '/' + (t.classes || 0), 'ห้องที่เช็คครบแล้ว', 'all')
      + dashStat_(t.present || 0, 'มาเรียน (คน)', 'done')
      + dashStat_(t.leave || 0, 'ลา (คน)', 'partial')
      + dashStat_(t.absent || 0, 'ขาด (คน)', 'none')
      + '</div>';
    if (!res.isToday && res.reason) html += '<div class="pp5-dw-note"><i class="bi bi-info-circle me-1"></i>' + escapeHtml_(res.reason) + ' จึงแสดงวันเรียนล่าสุดแทน</div>';
    // owner 2026-10-07: ห้องที่ยังไม่เช็คขึ้นก่อน (ในกลุ่มเดียวกันคงลำดับชั้นเดิม) และวันนี้เลย DASH_LATE_HOUR_ น.
    // แล้วยังไม่เช็ค = กรอบแดง "เลยเวลาเช็คชื่อ"  ก่อนเวลานั้นเป็นสีฟ้า "รอเช็คชื่อ" ไม่ใช่สีแดง
    const now = new Date();
    const late = !!res.isToday && (now.getHours() * 60 + now.getMinutes()) >= DASH_LATE_HOUR_ * 60;
    const rank = { none: 0, prefilled: 1, partial: 2, done: 3 };
    const classes = (res.classes || []).map((c, i) => ({ c, i }))
      .sort((a, b) => ((rank[a.c.state] ?? 2) - (rank[b.c.state] ?? 2)) || (a.i - b.i)).map((x) => x.c);
    html += '<div class="pp5-dw-grid pp5-dw-today-grid">' + classes.map((c) => {
      const waiting = c.state === 'none' || c.state === 'prefilled';
      const overdue = waiting && late;
      const badge = res.isToday && !late && c.state === 'none' ? ['info', 'รอเช็คชื่อ'] : [c.state, labels[c.state]];
      return '<button type="button" class="pp5-dw-tile' + (overdue ? ' is-overdue' : '') + '" data-dw-page="attendance_daily" data-dw-grade="' + escapeHtml_(c.grade) + '" data-dw-room="' + escapeHtml_(c.room) + '" data-dw-day="' + escapeHtml_(res.day) + '">'
        + '<b>' + escapeHtml_(c.label) + '</b>'
        + '<span class="pp5-dw-badge" style="' + DASH_TONE_[badge[0]] + '">' + badge[1] + '</span>'
        + (overdue ? '<small class="pp5-dw-late"><i class="bi bi-alarm me-1"></i>เลยเวลาเช็คชื่อ ' + DASH_LATE_HOUR_ + ':00 น.</small>' : '')
        + '<small>เช็คแล้ว ' + c.checked + '/' + c.total + ' คน</small>'
        + (c.checked ? '<small>มา ' + c.present + ' · ลา ' + c.leave + ' · ขาด ' + c.absent + '</small>' : '')
        + (c.prefilled && c.state !== 'prefilled' ? '<small>กรอกล่วงหน้า ' + c.prefilled + ' คน</small>' : '')
        + '<span class="pp5-dw-go">' + (c.state === 'done' ? 'ดูการเช็คชื่อ' : 'ไปเช็คชื่อ') + ' <i class="bi bi-arrow-right"></i></span>'
        + '</button>';
    }).join('') + '</div>';
    if ((res.classes || []).some((c) => c.state === 'prefilled')) html += '<div class="pp5-dw-note"><i class="bi bi-exclamation-triangle me-1"></i>"กรอกไว้ล่วงหน้า" คือมีข้อมูลวันนี้ที่บันทึกไว้ก่อนถึงวัน ครูยังไม่ได้เช็คชื่อจริงของวันนี้</div>';
    body.innerHTML = html;
  });
}

// ---------- ภาพรวมโรงเรียน รอบ 2 (owner 2026-10-07) ----------
// แถวตัวเลขสำคัญ 4 ใบแทนการ์ด ทั้งหมด/ชาย/หญิง: นักเรียน (ชาย-หญิงเป็นแถบเดียว), มาเรียนวันนี้,
// กรอกคะแนนภาคนี้, ประเมินภาคนี้  การ์ดเดิมยังอยู่ (ซ่อน) เพราะสคริปต์ของหน้าเขียนตัวเลขลงไป เราอ่านต่อ
const dashPct_ = (done, total) => (total ? Math.round((done / total) * 100) : 0);
function renderDashboardKpis_(frame) {
  if (!frame || frame.querySelector('#pp5DashKpis')) return;
  const total = frame.querySelector('#totalCount');
  const oldRow = total && total.closest('.row');
  if (!oldRow) return;
  const row = document.createElement('div');
  row.id = 'pp5DashKpis';
  row.className = 'pp5-kpis';
  const card = (key, icon, label, target) => '<button type="button" class="pp5-kpi pp5-kpi-' + key + '" data-kpi="' + key + '"' + (target ? ' data-kpi-target="' + target + '"' : ' disabled') + '>'
    + '<span class="pp5-kpi-icon"><i class="bi ' + icon + '"></i></span>'
    + '<span class="pp5-kpi-label">' + label + '</span><b class="pp5-kpi-value">-</b>'
    + '<span class="pp5-kpi-bar"><i style="width:0"></i></span><small class="pp5-kpi-sub">กำลังโหลด...</small></button>';
  row.innerHTML = card('students', 'bi-people-fill', 'นักเรียนทั้งหมด', '')
    + card('attendance', 'bi-calendar-check-fill', 'มาเรียนวันนี้', 'pp5DashToday')
    + card('scores', 'bi-pencil-square', 'กรอกคะแนน', 'pp5DashPending')
    + card('assess', 'bi-clipboard2-check-fill', 'ประเมินผล', 'pp5DashPending');
  oldRow.before(row);
  oldRow.classList.add('pp5-kpi-source');
  row.addEventListener('click', (event) => {
    const id = event.target.closest('[data-kpi-target]')?.getAttribute('data-kpi-target');
    const el = id && document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // นักเรียน: อ่านจากตัวเลขที่สคริปต์ของหน้าเขียนลงการ์ดเดิม
  const read = (id) => Number(String(frame.querySelector('#' + id)?.textContent || '').replace(/[^0-9]/g, '')) || 0;
  const syncStudents = () => {
    const all = read('totalCount');
    const male = read('maleCount');
    const female = read('femaleCount');
    if (!all) return;
    dashKpiSet_('students', all.toLocaleString('th-TH') + ' <small>คน</small>',
      '<span class="pp5-kpi-gender"><span class="is-m"><i class="bi bi-gender-male"></i> ชาย ' + male + '</span><span class="is-f"><i class="bi bi-gender-female"></i> หญิง ' + female + '</span></span>',
      dashPct_(male, male + female));
  };
  syncStudents();
  if (typeof MutationObserver === 'function') new MutationObserver(syncStudents).observe(oldRow, { childList: true, characterData: true, subtree: true });
}
function dashKpiSet_(key, valueHtml, subHtml, pct, tone) {
  const card = document.querySelector('#pp5DashKpis [data-kpi="' + key + '"]');
  if (!card) return;
  card.querySelector('.pp5-kpi-value').innerHTML = valueHtml;
  card.querySelector('.pp5-kpi-sub').innerHTML = subHtml;
  card.querySelector('.pp5-kpi-bar i').style.width = Math.max(0, Math.min(100, Number(pct) || 0)) + '%';
  card.dataset.tone = tone || '';
}
const dashKpiTone_ = (pct) => (pct >= 100 ? 'done' : pct >= 60 ? 'partial' : 'low');

// การ์ด "งานที่ยังค้าง": ห้อง x งาน (คะแนน + ประเมินแต่ละด้าน) ภาคเรียนปัจจุบัน กดช่องไหนก็ไปหน้านั้นของห้องนั้น
function renderDashboardPending_(frame, anchor) {
  if (!frame || frame.querySelector('#pp5DashPending')) return;
  const { body, meta } = dashCard_(frame, anchor, { id: 'pp5DashPending', icon: 'bi-list-check', iconBg: '#fef3c7', iconFg: '#b45309', title: 'งานที่ยังค้าง', storageKey: 'pp5DashPendingCollapsed' });
  dashCall_(body, 'getDashboardPendingWork', undefined, (res) => {
    const t = res.totals || {};
    const types = res.types || [];
    const rooms = res.rooms || [];
    const term = 'ภาค ' + (res.semester || 1);
    const scorePct = dashPct_(t.scoreDone, t.scoreTotal);
    const assessPct = dashPct_(t.assessDone, t.assessTotal);
    dashKpiSet_('scores', scorePct + '%', 'ครบ ' + (t.scoreDone || 0) + ' จาก ' + (t.scoreTotal || 0) + ' วิชา-ห้อง · ' + term, scorePct, dashKpiTone_(scorePct));
    dashKpiSet_('assess', assessPct + '%', types.length + ' ด้าน ทุกห้อง · ' + term, assessPct, dashKpiTone_(assessPct));
    meta.textContent = (res.scopeLabel || '') + ' · ปีการศึกษา ' + (res.academicYear || '') + ' · ภาคเรียนที่ ' + (res.semester || 1);
    dashScopeLabels_(frame, res);
    if (!rooms.length) { body.innerHTML = '<div class="pp5-dw-meta" style="margin-top:10px">ยังไม่มีนักเรียนในขอบเขตนี้</div>'; return; }
    const tone = (done, total) => (total && done >= total ? 'done' : done ? 'partial' : 'none');
    const cell = (done, total, page, cls, text, title, extra) => '<td><button type="button" class="pp5-pw-cell is-' + tone(done, total) + '" data-dw-page="' + page + '" data-dw-class="' + escapeHtml_(cls) + '"' + (extra || '')
      + (title ? ' title="' + escapeHtml_(title) + '"' : '') + '>' + (total && done >= total ? '<i class="bi bi-check-lg"></i> ครบ' : text) + '</button></td>';
    let html = '<div class="pp5-pw-wrap"><table class="pp5-pw"><thead><tr><th>ห้อง</th><th>คะแนน</th>'
      + types.map((ty) => '<th>' + escapeHtml_(ty.label) + '</th>').join('') + '</tr></thead><tbody>';
    let open = 0;
    rooms.forEach((r) => {
      const cls = JSON.stringify({ grade: r.grade, room: r.room });
      const sc = r.scores || { done: 0, total: 0, missing: [] };
      const scoreTarget = JSON.stringify({ grade: r.grade, room: r.room, semester: res.semester || 1 });
      const allDone = sc.done >= sc.total && types.every((ty) => (r.assessments[ty.key] || {}).done >= (r.assessments[ty.key] || {}).total);
      if (!allDone) open += 1;
      html += '<tr' + (allDone ? ' class="is-done"' : '') + '><th scope="row">' + escapeHtml_(r.label) + '<small>' + r.students + ' คน</small></th>'
        + cell(sc.done, sc.total, 'score_table_viewer', cls, sc.done + '/' + sc.total + ' วิชา', sc.missing.length ? 'ยังไม่ครบ: ' + sc.missing.join(', ') : '', ' data-dw-score="' + escapeHtml_(scoreTarget) + '"')
        + types.map((ty) => {
          const a = r.assessments[ty.key] || { done: 0, total: 0 };
          return cell(a.done, a.total, ty.page, cls, a.done + '/' + a.total + ' คน', a.total - a.done ? 'ยังไม่ประเมิน ' + (a.total - a.done) + ' คน' : '');
        }).join('') + '</tr>';
    });
    html += '</tbody></table></div>'
      + '<div class="pp5-pw-foot"><span><i class="bi bi-info-circle me-1"></i>' + (open ? 'ยังไม่ครบ ' + open + ' จาก ' + rooms.length + ' ห้อง · ' : 'ครบทุกห้องแล้ว · ')
      + 'กดช่องไหนก็ได้เพื่อไปทำต่อที่ห้องนั้น · คะแนน "ครบ" = นักเรียนทุกคนในห้องมีเกรดวิชานั้นแล้ว</span></div>';
    body.innerHTML = html;
  });
}

// รายการย่อยของการ์ดตรวจคะแนน: ห้อง · วิชา · ภาคเรียน · จำนวนคน + รายชื่อ + ปุ่มเปิดวิชานั้น
function dashScoreCheckGroups_(groups) {
  return '<div class="pp5-dw-groups">' + groups.map((g) => {
    const target = JSON.stringify({ grade: g.grade, room: g.room, subjectId: g.subjectId, subjectCode: g.subjectCode, semester: g.semester });
    // วิชาที่ตั้งไว้เป็นของชั้นอื่น จะไม่อยู่ในรายการวิชาของห้องนี้ในหน้ากรอกคะแนน
    const otherGrade = g.subjectGrade && g.grade && g.subjectGrade !== g.grade;
    return '<div class="pp5-dw-group">'
      + '<div class="pp5-dw-group-head"><span><b>' + escapeHtml_(g.classLabel) + '</b> · ' + escapeHtml_(g.subjectName)
      + (g.subjectCode ? ' (' + escapeHtml_(g.subjectCode) + ')' : '') + ' · ภาคเรียน ' + escapeHtml_(String(g.semester)) + ' · ' + g.students.length + ' คน</span>'
      + (otherGrade ? '' : '<button type="button" class="btn btn-sm btn-outline-primary" data-dw-page="score_table_viewer" data-dw-score="' + escapeHtml_(target) + '"><i class="bi bi-box-arrow-up-right me-1"></i>เปิดวิชานี้</button>')
      + '</div>'
      + (otherGrade ? '<small class="pp5-dw-group-warn"><i class="bi bi-exclamation-triangle me-1"></i>วิชานี้ตั้งไว้เป็นของชั้น ' + escapeHtml_(g.subjectGrade) + ' จึงไม่อยู่ในรายการวิชาของ ' + escapeHtml_(g.grade) + ' ในหน้ากรอกคะแนน</small>' : '')
      + '<details class="pp5-dw-group-names"><summary>รายชื่อ</summary><small>'
      + g.students.map((s) => escapeHtml_(s.id) + ' ' + escapeHtml_(s.name)).join('<br>') + '</small></details>'
      + '</div>';
  }).join('') + '</div>';
}

// การ์ด "ตรวจความถูกต้องของข้อมูล"
function renderDashboardChecks_(frame, anchor) {
  if (!frame || frame.querySelector('#pp5DashChecks')) return;
  const { body, meta } = dashCard_(frame, anchor, { id: 'pp5DashChecks', icon: 'bi-shield-check', iconBg: '#e0f2fe', iconFg: '#0369a1', title: 'ตรวจความถูกต้องของข้อมูล', storageKey: 'pp5DashChecksCollapsed' });
  dashCall_(body, 'getDashboardDataChecks', undefined, (res) => {
    meta.textContent = (res.scopeLabel || '') + ' · ปีการศึกษา ' + (res.academicYear || '') + ' · ' + (res.problems ? 'พบ ' + res.problems + ' เรื่องที่ควรแก้' : 'ไม่พบปัญหา');
    body.innerHTML = '<div style="margin-top:8px">' + (res.checks || []).map((c) => {
      const bad = c.count > 0;
      // holiday_attendance is informational (some schools do hold class on a real ราชการ
      // holiday) — shown with a neutral icon/wording, never as a red "ผิด" error, and kept
      // out of the header's "พบ N เรื่องที่ควรแก้" count (server already excludes it there).
      const info = c.severity === 'info';
      const icon = !bad ? 'bi-check-circle-fill text-success' : info ? 'bi-info-circle-fill text-primary' : 'bi-exclamation-circle-fill text-danger';
      const label = bad ? (info ? ' · พบ ' + c.count + ' ' + escapeHtml_(c.unit) + ' (' + c.students + ' คน)' : ' · ' + c.count + ' ' + escapeHtml_(c.unit) + ' (' + c.students + ' คน)') : ' · ไม่พบ';
      // Score checks come with groups (room + subject + semester + students): list them, each with a
      // button that opens exactly that subject, instead of one generic "ไปแก้".
      const groups = bad && Array.isArray(c.groups) && c.groups.length ? c.groups : null;
      return '<div class="pp5-dw-check"><i class="bi ' + icon + '"></i>'
        + '<div class="pp5-dw-check-text"><b>' + escapeHtml_(c.title) + label + '</b>'
        + (bad ? '<small>' + escapeHtml_(c.hint) + '</small>' + (c.classes && c.classes.length ? '<small>ห้อง: ' + c.classes.map(escapeHtml_).join(', ') + '</small>' : '') : '')
        + (groups ? dashScoreCheckGroups_(groups) : '')
        + '</div>' + (bad && !groups ? '<button type="button" class="btn btn-sm btn-outline-primary" data-dw-page="' + escapeHtml_(c.page) + '">' + (info ? 'ดูรายละเอียด' : 'ไปแก้') + '</button>' : '') + '</div>';
    }).join('') + '</div>';
  });
}

// การ์ด "สถานะบัญชีผู้ปกครอง" (เฉพาะแอดมิน)
function renderDashboardParentAccess_(frame, anchor) {
  if (!frame || frame.querySelector('#pp5DashParentAccess')) return;
  const { body, meta } = dashCard_(frame, anchor, { id: 'pp5DashParentAccess', icon: 'bi-people', iconBg: '#ede9fe', iconFg: '#5b21b6', title: 'สถานะบัญชีผู้ปกครอง', storageKey: 'pp5DashParentCollapsed' });
  dashCall_(body, 'getParentAccessStatus', '', (res) => {
    const rows = res.rows || [];
    const count = (status) => rows.filter((r) => r.status === status).length;
    const ready = count('ready');
    const missing = count('missing');
    const other = count('inactive') + count('conflict');
    // LINE: students whose parent account is linked to the school's LINE (only when line_links was readable).
    const lineKnown = res.lineKnown === true;
    const line = rows.filter((r) => r.lineLinked).length;
    meta.textContent = 'นักเรียน ' + rows.length + ' คน';
    const byGrade = new Map();
    rows.forEach((r) => {
      const key = r.grade + '/' + (r.classNo || '1');
      if (!byGrade.has(key)) byGrade.set(key, { label: key, total: 0, ready: 0, line: 0 });
      const g = byGrade.get(key); g.total += 1; if (r.status === 'ready') g.ready += 1; if (r.lineLinked) g.line += 1;
    });
    const groups = [...byGrade.values()].sort((a, b) => a.label.localeCompare(b.label, 'th', { numeric: true }));
    body.innerHTML = '<div class="pp5-dw-sum">'
      + dashStat_(ready, 'มีบัญชีแล้ว (คน)', 'done')
      + dashStat_(missing, 'ยังไม่มีบัญชี (คน)', 'none')
      + dashStat_(other, 'ปิดใช้ / ชื่อซ้ำครู (คน)', 'partial')
      + dashStat_(rows.length ? Math.round((ready / rows.length) * 100) + '%' : '0%', 'ครอบคลุม', 'all')
      + (lineKnown ? dashStat_(line + '/' + ready, 'เชื่อม LINE แล้ว (คน)', 'info') : '')
      + '</div><div class="pp5-dw-grid">' + groups.map((g) => '<button type="button" class="pp5-dw-tile" data-dw-page="parent_portal" data-dw-scroll="pp5ParentAccess">'
        + '<b>' + escapeHtml_(g.label) + '</b><span class="pp5-dw-badge" style="' + DASH_TONE_[g.ready === g.total ? 'done' : g.ready ? 'partial' : 'none'] + '">' + g.ready + '/' + g.total + ' คน</span>'
        + (g.total - g.ready ? '<small>ยังไม่มี ' + (g.total - g.ready) + ' คน</small>' : '<small>ครบแล้ว</small>')
        + (lineKnown ? '<small class="pp5-dw-line"><i class="bi bi-line" aria-hidden="true"></i> LINE ' + g.line + ' คน</small>' : '') + '</button>').join('') + '</div>'
      + (missing ? '<div style="margin-top:12px"><button type="button" class="btn btn-sm btn-primary" data-dw-page="parent_portal" data-dw-scroll="pp5ParentAccess"><i class="bi bi-key me-1"></i>ไปออกรหัสผู้ปกครอง</button></div>' : '');
  });
}

// การ์ด "นักเรียนที่ต้องติดตาม" ใน Smart Dashboard (อ่านอย่างเดียว; ข้อมูลจาก getDashboardWatchlist)
const DASH_WATCH_COLLAPSED_KEY_ = 'pp5DashWatchCollapsed';
function renderDashboardWatchlist_(frame, anchor) {
  if (!frame || frame.querySelector('#pp5DashWatchlist')) return;
  ensureDashStyles_(frame);
  const tone = {
    grade0: '--dw-bg:#fee2e2;--dw-fg:#b91c1c',
    r: '--dw-bg:#fef3c7;--dw-fg:#92400e',
    ms: '--dw-bg:#ffedd5;--dw-fg:#c2410c',
    attendance: '--dw-bg:#e0f2fe;--dw-fg:#0369a1',
    all: '--dw-bg:#ede9fe;--dw-fg:#5b21b6'
  };
  const card = document.createElement('div');
  card.id = 'pp5DashWatchlist';
  card.className = 'pp5-dw';
  card.innerHTML = '<div class="pp5-dw-head" role="button" tabindex="0" aria-expanded="true">'
    + '<h6><i class="bi bi-person-exclamation"></i>นักเรียนที่ต้องติดตาม</h6><span class="pp5-dw-meta" id="pp5DwMeta"></span>'
    + '<span class="pp5-dw-toggle"><span class="pp5-dw-toggle-label">ซ่อน</span><i class="bi bi-chevron-down"></i></span></div>'
    + '<div class="pp5-dw-body" id="pp5DwBody">' + (typeof window.loadingHtml === 'function' ? window.loadingHtml('กำลังตรวจสอบ') : 'กำลังตรวจสอบ...') + '</div>';
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling);
  else frame.appendChild(card);

  const setCollapsed = (collapsed, remember) => {
    card.classList.toggle('is-collapsed', collapsed);
    const head = card.querySelector('.pp5-dw-head');
    head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    card.querySelector('.pp5-dw-toggle-label').textContent = collapsed ? 'แสดง' : 'ซ่อน';
    if (remember) { try { localStorage.setItem(DASH_WATCH_COLLAPSED_KEY_, collapsed ? '1' : '0'); } catch (_) {} }
  };
  let startCollapsed = false;
  try { startCollapsed = localStorage.getItem(DASH_WATCH_COLLAPSED_KEY_) === '1'; } catch (_) {}
  setCollapsed(startCollapsed, false);
  const head = card.querySelector('.pp5-dw-head');
  head.addEventListener('click', () => setCollapsed(!card.classList.contains('is-collapsed'), true));
  head.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setCollapsed(!card.classList.contains('is-collapsed'), true); }
  });

  const body = card.querySelector('#pp5DwBody');
  const meta = card.querySelector('#pp5DwMeta');
  const thaiDate = (iso) => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return Number(m[3]) + ' ' + months[Number(m[2]) - 1] + ' ' + (Number(m[1]) + 543);
  };
  const tagHtml = (issue) => {
    let textLabel = issue.label;
    if (issue.subject) textLabel += ' · ' + issue.subject + (issue.semester ? ' ภาค ' + issue.semester : '');
    if (issue.type === 'attendance') textLabel += ' (' + issue.present + '/' + issue.total + ' วัน)';
    return '<span class="pp5-dw-tag" style="' + (tone[issue.type] || tone.all) + '">' + escapeHtml_(textLabel) + '</span>';
  };
  const ROW_LIMIT = 9;
  const render = (res) => {
    const counts = (res && res.counts) || {};
    meta.textContent = (res.scopeLabel || '') + ' · ปีการศึกษา ' + (res.academicYear || '') + (res.asOf ? ' · ถึงวันที่ ' + thaiDate(res.asOf) : '');
    const notes = [];
    if (counts.pendingFinal) notes.push('ไม่นับ ' + counts.pendingFinal + ' รายวิชาที่ยังไม่ได้กรอกคะแนนปลายภาค (คะแนนยังไม่ครบ)');
    if (counts.notEntered) notes.push('ไม่นับ ' + counts.notEntered + ' รายการที่เป็นแถวคะแนนว่าง (ศูนย์ทั้งแถว)');
    const noteHtml = notes.length ? '<div class="pp5-dw-meta" style="margin:-4px 0 6px"><i class="bi bi-info-circle me-1"></i>' + notes.map(escapeHtml_).join(' · ') + '</div>' : '';
    if (!counts.students) {
      // ไม่มีอะไรน่าห่วง = บรรทัดเดียวเล็ก ๆ (owner 2026-10-07: กล่องเขียวใหญ่กินที่โดยไม่จำเป็น)
      body.innerHTML = '<div class="pp5-dw-empty pp5-dw-empty-slim"><i class="bi bi-check-circle-fill me-2"></i>ยังไม่พบนักเรียนที่ได้เกรด 0, ร, มส หรือมาเรียนต่ำกว่า 80%</div>' + noteHtml;
      return;
    }
    const stat = (value, label, key) => '<div class="pp5-dw-stat" style="' + tone[key] + '"><b>' + value + '</b><span>' + label + '</span></div>';
    let html = '<div class="pp5-dw-sum">'
      + stat(counts.students, 'นักเรียนที่ต้องติดตาม (คน)', 'all')
      + stat(counts.grade0, 'เกรด 0 ที่กรอกครบแล้ว (รายวิชา)', 'grade0')
      + stat(counts.special, 'ร / มส (รายวิชา)', 'r')
      + stat(counts.attendance, 'มาเรียนต่ำกว่า 80% (คน)', 'attendance')
      + '</div>' + noteHtml;
    (res.classes || []).forEach((group, gi) => {
      html += '<div class="pp5-dw-class"><div class="pp5-dw-class-head"><b>' + escapeHtml_(group.label) + '</b><span class="pp5-dw-meta">' + group.students.length + ' คน</span>'
        + '<span class="pp5-dw-actions"><button type="button" class="btn btn-sm btn-outline-primary" data-dw-page="score_table_viewer"><i class="bi bi-pencil-square me-1"></i>กรอกคะแนน</button>'
        + '<button type="button" class="btn btn-sm btn-outline-info" data-dw-page="attendance_daily"><i class="bi bi-calendar-check me-1"></i>เวลาเรียน</button></span></div>';
      // เรียงนักเรียนเป็นหลายคอลัมน์ตามความกว้างจอ (จอแคบเหลือคอลัมน์เดียว) แทนการต่อลงด้านล่างทีละแถว
      html += '<div class="pp5-dw-list">';
      group.students.forEach((s, si) => {
        html += '<div class="pp5-dw-row"' + (si >= ROW_LIMIT ? ' data-dw-extra="' + gi + '" hidden' : '') + '><div class="pp5-dw-name">' + escapeHtml_(s.name) + '<small>รหัส ' + escapeHtml_(s.id) + '</small></div>'
          + '<div class="pp5-dw-tags">' + s.issues.map(tagHtml).join('') + '</div></div>';
      });
      html += '</div>';
      if (group.students.length > ROW_LIMIT) html += '<button type="button" class="pp5-dw-more" data-dw-more="' + gi + '">ดูอีก ' + (group.students.length - ROW_LIMIT) + ' คน</button>';
      html += '</div>';
    });
    body.innerHTML = html;
  };
  body.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-dw-page]');
    if (nav) { if (typeof window.navigateTo === 'function') window.navigateTo(nav.getAttribute('data-dw-page')); return; }
    const more = event.target.closest('[data-dw-more]');
    if (more) {
      body.querySelectorAll('[data-dw-extra="' + more.getAttribute('data-dw-more') + '"]').forEach((row) => { row.hidden = false; });
      more.remove();
    }
  });
  if (!(window.google && google.script && google.script.run)) { body.textContent = 'ยังโหลดข้อมูลไม่ได้'; return; }
  google.script.run
    .withSuccessHandler((res) => { try { render(res || {}); } catch (err) { body.textContent = 'แสดงผลไม่สำเร็จ: ' + (err && err.message || err); } })
    .withFailureHandler((error) => { body.innerHTML = '<div class="text-danger small">' + escapeHtml_(String(error && error.message || error)) + '</div>'; })
    .getDashboardWatchlist();
}

function enhanceSupabaseHomeHubPage_() {
  const frame = document.getElementById('contentFrame');
  if (!frame) return;

  // เจ้าหน้าที่ธุรการ: การ์ดในหน้าหลักกรองด้วย data-roles (admin/teacher/parent) จึงเติม registrar ให้การ์ดของหน้าที่เปิดได้
  // ทั้งตอนแสดงและตอนค้นหา (ช่องค้นหาอ่าน data-roles ทุกครั้ง) — สิทธิ์จริงยังตรวจที่ include() และฐานข้อมูล
  if ((localStorage.getItem('role') || '') === 'registrar') {
    const allowed = (window.PP5Permissions && window.PP5Permissions.registrarPages) || [];
    frame.querySelectorAll('.hub-card[data-page]').forEach((card) => {
      if (!allowed.includes(card.getAttribute('data-page'))) return;
      const roles = String(card.getAttribute('data-roles') || '').split(',').map((r) => r.trim()).filter(Boolean);
      if (!roles.includes('registrar')) card.setAttribute('data-roles', roles.concat('registrar').join(','));
      card.classList.remove('is-hidden');
    });
    frame.querySelectorAll('.hub-section').forEach((section) => {
      if (section.querySelector('.hub-card:not(.is-hidden)')) section.classList.remove('is-empty');
    });
  }

  // ── อัปเดตคำทักทายให้แสดง "ชื่อ นามสกุล" แทน "ชื่อผู้ใช้" ──
  updateHubSubLineWithFullName_();
  const subLineEl = frame.querySelector('#hubSubLine');
  if (subLineEl && !subLineEl._nameObserverAttached) {
    subLineEl._nameObserverAttached = true;
    const subObserver = new MutationObserver(() => {
      subObserver.disconnect();
      updateHubSubLineWithFullName_();
      subObserver.observe(subLineEl, { childList: true, characterData: true, subtree: true });
    });
    subObserver.observe(subLineEl, { childList: true, characterData: true, subtree: true });
  }

  const hubPage = frame.querySelector('.hub-page') || frame;
  if (!hubPage) return;

  // เมนูหลักแบบการ์ดสี (แทนที่ "เมนูด่วน" เดิม; ทุกเส้นทางเดิมยังอยู่ครบ)
  try { enhanceHomeHubMainMenu_(hubPage); } catch (err) { console.warn('main menu enhancer failed', err); }
  // แบนเนอร์โรงเรียน (ตรา ชื่อ สังกัด คำขวัญ สโลแกน) บนกล่องต้อนรับเดิม (js/school-branding.js)
  try { window.PP5SchoolBranding?.decorateHome?.(hubPage); } catch (err) { console.warn('school banner failed', err); }
  // เมนู "สำรองข้อมูล" + แถบเตือนเมื่อไม่ได้สำรองนาน (js/data-backup.js, admin เท่านั้น)
  try { window.PP5Backup?.enhanceHomeHub?.(hubPage); } catch (err) { console.warn('backup reminder failed', err); }
  try { window.PP5History?.enhanceHomeHub?.(hubPage); } catch (err) { console.warn('history menu failed', err); }
  try { window.PP5ExamAnalysis?.enhanceHomeHub?.(hubPage); } catch (err) { console.warn('exam analysis menu failed', err); }
  try { window.PP5Behavior?.enhanceHomeHub?.(hubPage); } catch (err) { console.warn('behavior menu failed', err); }

  if (hubPage.querySelector('#homeroomRoadmapWidget')) return;

  // อ่านระดับชั้นครูประจำชั้นจาก localStorage หรือ GradeClassHelper
  let saved = null;
  try {
    if (window.GradeClassHelper && typeof window.GradeClassHelper.loadSelection === 'function') {
      saved = window.GradeClassHelper.loadSelection();
    }
  } catch (_) {}

  const teacherClass = localStorage.getItem('className') || '';
  let initialGrade = saved?.grade || 'ป.1';
  if (teacherClass) {
    const m = teacherClass.match(/([ปม])\.?\s*([1-6])/i);
    if (m) initialGrade = m[1] + '.' + m[2];
  }

  const grades = window.PP5Grades?.list?.() || ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
  let currentActiveGrade = grades.includes(initialGrade) ? initialGrade : 'ป.1';
  // ห้องของแผงความคืบหน้า (owner 2026-10-14: ระบบต้องรองรับห้อง 2, 3 … — เดิมส่งห้อง '1' เสมอ)
  let currentActiveRoom = String(saved?.classNo || '1').trim() || '1';
  const teacherRoom = teacherClass.match(/\/\s*(\d+)/);
  if (teacherRoom) currentActiveRoom = teacherRoom[1];
  const teacherFullName = getUserFullName_();

  // สร้าง Card Container สำหรับ Infographic Roadmap
  const card = document.createElement('div');
  card.id = 'homeroomRoadmapWidget';
  card.className = 'homeroom-roadmap-card animate-fade-in';

  let pillsHtml = grades.map(g => `<button type="button" class="roadmap-grade-pill ${g === currentActiveGrade ? 'active' : ''}" data-grade="${g}" data-room="1">${g}</button>`).join('');

  card.innerHTML = `
    <div class="roadmap-header">
      <div class="roadmap-title-group">
        <div class="roadmap-icon-badge">
          <i class="bi bi-signpost-split"></i>
        </div>
        <div>
          <h3 class="roadmap-title">เส้นทางครูประจำชั้น</h3>
          <div class="roadmap-subtitle">ติดตามความก้าวหน้าภารกิจ <strong id="rmGradeLabel">${currentActiveGrade}/${currentActiveRoom}</strong> <span id="rmTeacherNameWrap">• ครูผู้ดูแล: <strong class="text-primary" id="rmTeacherNameLabel">${teacherFullName}</strong></span> สู่ความพร้อมออกเอกสาร ปพ.5 / ปพ.6</div>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <div class="roadmap-pills-bar" id="rmPillsBar">
          ${pillsHtml}
        </div>
        <button type="button" class="btn btn-sm btn-outline-info fw-bold d-flex align-items-center gap-1 shadow-sm" id="btnRoadmapTeacherSig" style="border-radius:999px;font-size:0.8rem;padding:4px 12px;white-space:nowrap;" title="ลงลายมือชื่อครูประจำชั้นสำหรับห้องนี้">
          <i class="bi bi-pen-fill text-info"></i> เซ็นชื่อครูห้องนี้
        </button>
        <button type="button" class="btn btn-sm btn-outline-success fw-bold d-flex align-items-center gap-1 shadow-sm" id="btnRoadmapSarAnalytics" style="border-radius:999px;font-size:0.8rem;padding:4px 12px;white-space:nowrap;" title="วิเคราะห์ผลสัมฤทธิ์ทางการเรียน 8 กลุ่มสาระ และพัฒนาการ 4 ด้าน สำหรับ SAR">
          <i class="bi bi-file-earmark-bar-graph-fill text-success"></i> วิเคราะห์ SAR
        </button>
        <button type="button" class="btn btn-sm btn-outline-primary fw-bold d-flex align-items-center gap-1 shadow-sm" id="btnRoadmapHealthDoctor" style="border-radius:999px;font-size:0.8rem;padding:4px 12px;white-space:nowrap;" title="ตรวจเช็คความพร้อมข้อมูลก่อนสั่งพิมพ์ ปพ.5 / ปพ.6">
          <i class="bi bi-heart-pulse-fill text-danger"></i> ตรวจสุขภาพ ปพ.
        </button>
      </div>
    </div>

    <div class="roadmap-summary-strip" id="rmSummaryStrip">
      <div class="roadmap-status-main">
        <div class="roadmap-percent-pill" id="rmPercentPill">...</div>
        <div>
          <div class="roadmap-status-headline" id="rmStatusHeadline">กำลังโหลดข้อมูลความก้าวหน้า...</div>
          <div class="roadmap-status-sub" id="rmStatusSub">ระบบกำลังตรวจสอบข้อมูลเวลาเรียน คะแนน และการประเมิน 4 ด้าน</div>
        </div>
      </div>
      <div id="rmActionArea"></div>
    </div>

    <div class="roadmap-pipeline-wrap">
      <div class="roadmap-track">
        <div class="roadmap-track-fill" id="rmTrackFill" style="width: 0%;"></div>
      </div>
      <div class="roadmap-nodes-container" id="rmNodesContainer">
        <!-- 5 Stations จะถูกเรนเดอร์โดย JavaScript -->
      </div>
    </div>

    <div class="roadmap-drawer" id="rmDrawer" style="display: none;">
      <div class="drawer-header">
        <h4 class="drawer-title" id="rmDrawerTitle"></h4>
        <button type="button" class="btn-close btn-sm" id="rmBtnCloseDrawer" aria-label="ปิด"></button>
      </div>
      <div class="drawer-items-grid" id="rmDrawerGrid"></div>
    </div>
  `;

  // เมนูหลักมาก่อน รายละเอียดห้องและเครื่องมือครูเปิดเมื่อจำเป็น
  enhanceHomeCompactLayout_(hubPage, card);

  // ผูกการคลิกเลือกชั้นเรียน (Pills)
  // ปุ่มห้อง: ผูกแบบ delegation เพราะปุ่มถูกสร้างใหม่เมื่อรู้ห้องจริง (ชั้นละหลายห้อง)
  card.addEventListener('click', (event) => {
    const pill = event.target.closest('.roadmap-grade-pill');
    if (!pill || !card.contains(pill)) return;
    card.querySelectorAll('.roadmap-grade-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentActiveGrade = pill.getAttribute('data-grade');
    currentActiveRoom = pill.getAttribute('data-room') || '1';
    const label = card.querySelector('#rmGradeLabel');
    if (label) label.textContent = currentActiveGrade + '/' + currentActiveRoom;
    fetchProgress(currentActiveGrade);
  });
  if (typeof window.PP5LoadAllRooms === 'function') {
    window.PP5LoadAllRooms().then((rooms) => {
      const bar = card.querySelector('#rmPillsBar');
      const known = rooms.filter((r) => grades.includes(r.grade));
      if (!bar || !known.length || !card.isConnected) return;
      const list = grades.flatMap((g) => { const own = known.filter((r) => r.grade === g); return own.length ? own : [{ grade: g, room: '1' }]; });
      if (!list.some((r) => r.grade === currentActiveGrade && r.room === currentActiveRoom)) {
        currentActiveRoom = (list.find((r) => r.grade === currentActiveGrade) || { room: '1' }).room;
      }
      bar.innerHTML = list.map((r) => `<button type="button" class="roadmap-grade-pill ${r.grade === currentActiveGrade && r.room === currentActiveRoom ? 'active' : ''}" data-grade="${r.grade}" data-room="${r.room}">${r.grade}/${r.room}</button>`).join('');
      const label = card.querySelector('#rmGradeLabel');
      if (label) label.textContent = currentActiveGrade + '/' + currentActiveRoom;
      if (typeof card.__pp5SyncRoomSelect === 'function') card.__pp5SyncRoomSelect();
      if (currentActiveRoom !== '1') fetchProgress(currentActiveGrade);
    }).catch(() => { /* keep the grade buttons */ });
  }

  // ปุ่มเปิดเซ็นชื่อครูประจำชั้นห้องนี้
  const btnTeacherSig = card.querySelector('#btnRoadmapTeacherSig');
  if (btnTeacherSig) {
    btnTeacherSig.addEventListener('click', () => {
      const roomKey = `${currentActiveGrade}/${currentActiveRoom}`;
      showSignaturePadModal_(`ครูประจำชั้น ${roomKey}`, (dataUrl) => {
        if (typeof google !== 'undefined' && google.script?.run) {
          google.script.run
            .withSuccessHandler(() => {
              alert(`✅ บันทึกลายเซ็นครูประจำชั้นห้อง ${roomKey} เรียบร้อยแล้ว!`);
            })
            .withFailureHandler((err) => {
              alert(`เกิดข้อผิดพลาด: ${err.message || err}`);
            })
            .saveSchoolSignatures({ teachers: { [roomKey]: dataUrl } });
        }
      });
    });
  }

  // ปุ่มเปิดวิเคราะห์ผลสัมฤทธิ์ SAR
  const btnSarAnalytics = card.querySelector('#btnRoadmapSarAnalytics');
  if (btnSarAnalytics) {
    btnSarAnalytics.addEventListener('click', () => {
      showSarAnalyticsModal_();
    });
  }

  // ปุ่มเปิดตรวจสุขภาพ ปพ.
  const btnHealthDoc = card.querySelector('#btnRoadmapHealthDoctor');
  if (btnHealthDoc) {
    btnHealthDoc.addEventListener('click', () => {
      if (latestProgressData) {
        showHealthDoctorModal(latestProgressData);
      } else {
        fetchProgress(currentActiveGrade);
      }
    });
  }

  // ปุ่มปิด Drawer
  const btnClose = card.querySelector('#rmBtnCloseDrawer');
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      const drawer = card.querySelector('#rmDrawer');
      if (drawer) drawer.style.display = 'none';
      card.querySelectorAll('.roadmap-node').forEach(n => n.classList.remove('is-selected'));
    });
  }

  // ดึงข้อมูลความก้าวหน้าจาก Backend
  function fetchProgress(grade) {
    const room = currentActiveRoom;
    const percentPill = card.querySelector('#rmPercentPill');
    const headline = card.querySelector('#rmStatusHeadline');
    const sub = card.querySelector('#rmStatusSub');
    const trackFill = card.querySelector('#rmTrackFill');
    const nodesContainer = card.querySelector('#rmNodesContainer');
    const actionArea = card.querySelector('#rmActionArea');

    if (typeof google !== 'undefined' && google.script && google.script.run && typeof google.script.run.getHomeroomProgressStatus === 'function') {
      google.script.run
        .withSuccessHandler(data => { if (grade === currentActiveGrade && room === currentActiveRoom) renderData(data); })
        .withFailureHandler(err => {
          if (grade !== currentActiveGrade || room !== currentActiveRoom) return;
          console.warn('Roadmap fetch fallback:', err);
          renderFallback(grade);
        })
        .getHomeroomProgressStatus(grade, room);
    } else {
      renderFallback(grade);
    }

    function renderData(data) {
      if (!data) return renderFallback(grade);
      latestProgressData = data;
      const percent = data.overallPercent || 0;
      if (percentPill) percentPill.textContent = percent + '%';
      if (trackFill) trackFill.style.width = Math.min(100, Math.max(5, percent)) + '%';

      const ms = data.milestones || {};
      const stations = [
        { id: 'attendance', num: 1, title: 'เวลาเรียน', icon: 'bi-calendar-check', data: ms.attendance, nextAction: 'attendance_monthly', actionLabel: 'บันทึกเวลาเรียน' },
        { id: 'scores', num: 2, title: 'คะแนน', icon: 'bi-journal-bookmark', data: ms.scores, nextAction: 'score_table_viewer', actionLabel: 'กรอกคะแนน' },
        { id: 'assessments', num: 3, title: 'ประเมินผล', icon: 'bi-clipboard2-check', data: ms.assessments, nextAction: 'characteristic_assessment', actionLabel: 'ประเมินผล' },
        { id: 'health', num: 4, title: 'สุขภาพ/ความเห็น', icon: 'bi-heart-pulse', data: ms.health, nextAction: 'student_growth_entry', actionLabel: 'บันทึกสุขภาพ' },
        { id: 'export', num: 5, title: 'เอกสาร', icon: 'bi-printer-fill', data: ms.export, nextAction: 'export_pdf_page', actionLabel: 'พิมพ์เอกสาร' }
      ];

      // หา Station ที่เป็นจุดปัจจุบัน (สถานีแรกที่ยังไม่เสร็จ)
      let activeIndex = stations.findIndex(s => !s.data?.isDone);
      if (activeIndex === -1) activeIndex = stations.length - 1;

      // อัปเดตข้อความแถบสรุปสถานะ
      const activeStation = stations[activeIndex];
      if (data.isReadyForPP5) {
        if (headline) headline.textContent = 'ข้อมูลครบ พร้อมพิมพ์เอกสาร';
        if (sub) sub.textContent = 'ข้อมูลครบทุกด้านแล้ว พร้อมพิมพ์ ปพ.5 / ปพ.6 และส่งออก SchoolMIS ได้ทันที';
        if (actionArea) actionArea.innerHTML = '<button type="button" class="btn btn-sm btn-success fw-bold d-flex align-items-center gap-1" onclick="navigateTo(\'export_pdf_page\')"><i class="bi bi-printer"></i> พิมพ์ ปพ. ทันที</button>';
      } else {
        if (headline) headline.textContent = `งานถัดไป: ${activeStation.title}`;
        if (sub) sub.textContent = `ดำเนินการต่อเพื่อปลดล็อกการออกเอกสาร ปพ. ของชั้น ${grade}/1`;
        if (actionArea) actionArea.innerHTML = `<button type="button" class="btn btn-sm btn-primary fw-bold d-flex align-items-center gap-1" onclick="navigateTo('${activeStation.nextAction}')"><i class="bi bi-arrow-right-circle"></i> ${activeStation.actionLabel}</button>`;
      }

      // วาดสถานีบนเส้นทาง Metro Pipeline
      if (nodesContainer) {
        nodesContainer.innerHTML = '';
        stations.forEach((st, idx) => {
          const isDone = !!st.data?.isDone;
          const isActive = (idx === activeIndex) && !isDone;

          let statusClass = 'is-pending';
          let badgeClass = 'badge-pending';
          let circleContent = `<i class="bi ${st.icon}"></i>`;

          if (isDone) {
            statusClass = 'is-done';
            badgeClass = 'badge-done';
            circleContent = '<i class="bi bi-check2"></i>';
          } else if (isActive) {
            statusClass = 'is-active';
            badgeClass = 'badge-active';
          }

          const node = document.createElement('div');
          node.className = `roadmap-node ${statusClass}`;
          node.setAttribute('data-id', st.id);
          node.innerHTML = `
            <div class="roadmap-node-circle">${circleContent}</div>
            <div class="roadmap-node-title">${st.title}</div>
            <span class="roadmap-node-badge ${badgeClass}">${st.data?.badge || (isDone ? 'เรียบร้อย' : 'รอข้อมูล')}</span>
          `;

          node.addEventListener('click', () => {
            card.querySelectorAll('.roadmap-node').forEach(n => n.classList.remove('is-selected'));
            node.classList.add('is-selected');
            openDrawer(st);
          });

          nodesContainer.appendChild(node);
        });
      }
    }

    function openDrawer(st) {
      const drawer = card.querySelector('#rmDrawer');
      const title = card.querySelector('#rmDrawerTitle');
      const grid = card.querySelector('#rmDrawerGrid');
      if (!drawer || !title || !grid) return;

      title.innerHTML = `<i class="bi ${st.icon} text-primary"></i> รายละเอียด: ${st.title}`;
      grid.innerHTML = '';

      const items = st.data?.items || [];
      if (items.length > 0) {
        items.forEach(item => {
          const itemEl = document.createElement('div');
          const isDone = !!item.recorded || !!item.done;
          itemEl.className = `drawer-subitem ${isDone ? 'is-done' : 'is-pending'}`;

          let navBtn = '';
          if (item.page) {
            navBtn = `<button type="button" class="drawer-action-btn ${isDone ? 'btn-emerald' : 'btn-amber'}" onclick="navigateTo('${item.page}')">${isDone ? 'เปิดดู' : 'บันทึก'}</button>`;
          } else if (st.id === 'attendance') {
            navBtn = `<button type="button" class="drawer-action-btn ${isDone ? 'btn-emerald' : 'btn-amber'}" onclick="navigateTo('attendance_monthly')">${isDone ? 'ดูบันทึก' : 'เช็คชื่อ'}</button>`;
          } else if (st.id === 'scores') {
            navBtn = `<button type="button" class="drawer-action-btn ${isDone ? 'btn-emerald' : 'btn-amber'}" onclick="navigateTo('score_table_viewer')">${isDone ? 'ดูคะแนน' : 'กรอก'}</button>`;
          }

          itemEl.innerHTML = `
            <div class="d-flex align-items-center gap-2">
              <i class="bi ${isDone ? 'bi-check-circle-fill text-success' : 'bi-clock text-warning'}"></i>
              <span>${item.label || item.name || item.fullName || 'รายการ'}</span>
            </div>
            ${navBtn}
          `;
          grid.appendChild(itemEl);
        });
      } else {
        if (st.id === 'export') {
          grid.innerHTML = `
            <div class="drawer-subitem is-done">
              <span><i class="bi bi-file-earmark-pdf text-danger"></i> เอกสารแบบ ปพ.5 (สมุดประจำชั้น)</span>
              <button type="button" class="drawer-action-btn btn-emerald" onclick="navigateTo('export_pdf_page')">พิมพ์ ปพ.5</button>
            </div>
            <div class="drawer-subitem is-done">
              <span><i class="bi bi-file-text text-primary"></i> ใบรายงานผลรายบุคคล ปพ.6 (One Page)</span>
              <button type="button" class="drawer-action-btn btn-emerald" onclick="navigateTo('report_card_generator')">พิมพ์ ปพ.6</button>
            </div>
            <div class="drawer-subitem is-done">
              <span><i class="bi bi-cloud-arrow-up text-success"></i> ส่งออกข้อมูลเข้า SchoolMIS (สพฐ.)</span>
              <button type="button" class="drawer-action-btn btn-emerald" onclick="navigateTo('schoolmis_sync')">ส่งออก CSV</button>
            </div>
          `;
        } else {
          grid.innerHTML = '<div class="p-2 text-muted small">ยังไม่มีรายการย่อย หรือบันทึกครบถ้วนแล้ว</div>';
        }
      }

      drawer.style.display = 'block';
      drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderFallback(fallbackGrade) {
      renderData({
        grade: fallbackGrade,
        classNo: '1',
        overallPercent: 65,
        isReadyForPP5: false,
        milestones: {
          attendance: {
            title: 'เวลาเรียน',
            badge: '8/11 ด.',
            isDone: false,
            items: [
              { label: 'พ.ค. 69', recorded: true },
              { label: 'มิ.ย. 69', recorded: true },
              { label: 'ก.ค. 69', recorded: true },
              { label: 'ส.ค. 69', recorded: true },
              { label: 'ก.ย. 69', recorded: true },
              { label: 'ต.ค. 69', recorded: true },
              { label: 'พ.ย. 69', recorded: true },
              { label: 'ธ.ค. 69', recorded: true },
              { label: 'ม.ค. 70', recorded: false },
              { label: 'ก.พ. 70', recorded: false },
              { label: 'มี.ค. 70', recorded: false }
            ]
          },
          scores: {
            title: 'คะแนนรายวิชา',
            badge: '8/8 วิชา',
            isDone: true,
            items: [
              { label: 'ภาษาไทย', recorded: true },
              { label: 'คณิตศาสตร์', recorded: true },
              { label: 'วิทยาศาสตร์', recorded: true },
              { label: 'สังคมศึกษา', recorded: true },
              { label: 'ประวัติศาสตร์', recorded: true },
              { label: 'สุขศึกษาฯ', recorded: true },
              { label: 'ศิลปะ', recorded: true },
              { label: 'ภาษาอังกฤษ', recorded: true }
            ]
          },
          assessments: {
            title: 'ประเมิน 4 ด้าน',
            badge: '2/4 ด้าน',
            isDone: false,
            items: [
              { label: 'คุณลักษณะอันพึงประสงค์ 8 ข้อ', page: 'characteristic_assessment', done: true },
              { label: 'การอ่าน คิดวิเคราะห์ และเขียน', page: 'read_think_write_form', done: true },
              { label: 'สมรรถนะสำคัญ 5 ด้าน', page: 'competency_assessment', done: false },
              { label: 'กิจกรรมพัฒนาผู้เรียน (ลูกเสือ/ชุมนุม)', page: 'activity_assessment', done: false }
            ]
          },
          health: {
            title: 'สุขภาพ/ความเห็น',
            badge: 'รอข้อมูล',
            isDone: false,
            items: [
              { label: 'น้ำหนัก-ส่วนสูง ภาคเรียนที่ 1', page: 'student_growth_entry', done: true },
              { label: 'น้ำหนัก-ส่วนสูง ภาคเรียนที่ 2', page: 'student_growth_entry', done: false },
              { label: 'บันทึกความเห็นครูประจำชั้น', page: 'teacher_comment_form_backup', done: false }
            ]
          },
          export: {
            title: 'ปลดล็อก ปพ.',
            badge: 'รอข้อมูลครบ',
            isDone: false
          }
        }
      });
    }
  }

  // กล่องตรวจสุขภาพข้อมูล ปพ.5 / ปพ.6 (Room Health Doctor Dialog)
  function showHealthDoctorModal(data) {
    if (!data) return;
    document.getElementById('pp5HealthDoctorOverlay')?.remove();

    const isReady = !!data.isReadyForPP5;
    const percent = data.overallPercent || 0;
    const ms = data.milestones || {};

    const overlay = document.createElement('div');
    overlay.id = 'pp5HealthDoctorOverlay';
    overlay.className = 'roadmap-health-overlay';

    overlay.innerHTML = `
      <div class="roadmap-health-modal">
        <div class="roadmap-health-header">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-clipboard2-pulse-fill text-primary" style="font-size:1.5rem;"></i>
            <div>
              <h5 class="mb-0 fw-bold">ตรวจสุขภาพข้อมูล ปพ.5 / ปพ.6</h5>
              <small class="text-muted">ชั้น${window.PP5Grades?.fullName?.(data.grade) || data.grade}/1 (ปีการศึกษา ${data.academicYear || '2569'})</small>
            </div>
          </div>
          <button type="button" class="btn-close" id="btnCloseHealthDoctor" aria-label="ปิด"></button>
        </div>

        <div class="roadmap-health-body">
          <div class="p-3 mb-3 rounded-3" style="background:${isReady ? '#ecfdf5' : '#eff6ff'};border:1px solid ${isReady ? '#a7f3d0' : '#bfdbfe'};">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <strong class="fs-6 ${isReady ? 'text-success' : 'text-primary'}">
                ${isReady ? '🎉 ข้อมูลสมบูรณ์ครบถ้วน 100%' : 'ความพร้อมของข้อมูลห้องนี้:'}
              </strong>
              <span class="badge ${isReady ? 'bg-success' : 'bg-primary'} fs-6">${percent}%</span>
            </div>
            <div class="progress" style="height:10px;border-radius:999px;background:#e2e8f0;">
              <div class="progress-bar ${isReady ? 'bg-success' : 'bg-primary'}" style="width:${percent}%;transition:width .5s ease;"></div>
            </div>
            <div class="small mt-2 ${isReady ? 'text-success' : 'text-muted'}">
              ${isReady ? 'ข้อมูลครบทุกด้านแล้ว พร้อมส่งงานฝ่ายวิชาการและออกเอกสาร ปพ. ได้ทันที' : 'ตรวจสอบรายการที่ยังไม่สมบูรณ์ด้านล่าง แล้วคลิกเพื่อแก้ไขได้ทันที'}
            </div>
            ${isReady ? `
              <div class="mt-3 pt-2 border-top d-flex gap-2 flex-wrap">
                <button type="button" class="btn btn-sm btn-success fw-bold flex-grow-1" onclick="if (window.GradeClassHelper?.saveSelection) window.GradeClassHelper.saveSelection('${data.grade}', '1'); document.getElementById('pp5HealthDoctorOverlay')?.remove(); navigateTo('pp5_full_book');">
                  <i class="bi bi-journal-bookmark-fill me-1"></i> พิมพ์ ปพ.5 รวมเล่มทันที
                </button>
                <button type="button" class="btn btn-sm btn-outline-primary fw-bold" onclick="if (window.GradeClassHelper?.saveSelection) window.GradeClassHelper.saveSelection('${data.grade}', '1'); document.getElementById('pp5HealthDoctorOverlay')?.remove(); navigateTo('report_card_generator');">
                  <i class="bi bi-journal-medical me-1"></i> พิมพ์ ปพ.6
                </button>
              </div>
            ` : ''}
          </div>

          <div class="health-status-card ${ms.attendance?.isDone ? 'is-pass' : 'is-warning'}">
            <div>
              <div class="fw-bold d-flex align-items-center gap-2">
                <i class="bi ${ms.attendance?.isDone ? 'bi-check-circle-fill text-success' : 'bi-exclamation-circle-fill text-warning'}"></i>
                1. เวลาเรียนตลอดปี (พ.ค. 69 - มี.ค. 70)
              </div>
              <small class="text-muted ms-4">เช็คชื่อแล้ว ${ms.attendance?.badge || '-'} ${ms.attendance?.isDone ? '(ครบตามเกณฑ์ สพฐ.)' : '(ยังมีเดือนที่ยังไม่ได้บันทึก)'}</small>
            </div>
            <button type="button" class="btn btn-sm ${ms.attendance?.isDone ? 'btn-outline-success' : 'btn-primary'}" onclick="document.getElementById('pp5HealthDoctorOverlay')?.remove();navigateTo('attendance_monthly');">
              ${ms.attendance?.isDone ? 'ดูบันทึก' : 'ไปเช็คชื่อ'}
            </button>
          </div>

          <div class="health-status-card ${ms.scores?.isDone ? 'is-pass' : 'is-warning'}">
            <div>
              <div class="fw-bold d-flex align-items-center gap-2">
                <i class="bi ${ms.scores?.isDone ? 'bi-check-circle-fill text-success' : 'bi-exclamation-circle-fill text-warning'}"></i>
                2. คะแนนรายวิชาพื้นฐานและเพิ่มเติม
              </div>
              <small class="text-muted ms-4">บันทึกแล้ว ${ms.scores?.badge || '-'} ${ms.scores?.isDone ? '(ครบทุกวิชา)' : '(ยังมีวิชาที่ยังไม่กรอกคะแนน)'}</small>
            </div>
            <button type="button" class="btn btn-sm ${ms.scores?.isDone ? 'btn-outline-success' : 'btn-primary'}" onclick="document.getElementById('pp5HealthDoctorOverlay')?.remove();navigateTo('score_table_viewer');">
              ${ms.scores?.isDone ? 'ดูคะแนน' : 'ไปกรอกคะแนน'}
            </button>
          </div>

          <div class="health-status-card ${ms.assessments?.isDone ? 'is-pass' : 'is-warning'}">
            <div>
              <div class="fw-bold d-flex align-items-center gap-2">
                <i class="bi ${ms.assessments?.isDone ? 'bi-check-circle-fill text-success' : 'bi-exclamation-circle-fill text-warning'}"></i>
                3. ผลการประเมิน 4 ด้านตามหลักสูตร
              </div>
              <small class="text-muted ms-4">ประเมินแล้ว ${ms.assessments?.badge || '-'} (คุณลักษณะ, อ่านคิดเขียน, สมรรถนะ, กิจกรรม)</small>
            </div>
            <button type="button" class="btn btn-sm ${ms.assessments?.isDone ? 'btn-outline-success' : 'btn-primary'}" onclick="document.getElementById('pp5HealthDoctorOverlay')?.remove();navigateTo('characteristic_assessment');">
              ${ms.assessments?.isDone ? 'ดูผลประเมิน' : 'ไปประเมิน'}
            </button>
          </div>

          <div class="health-status-card ${ms.health?.isDone ? 'is-pass' : 'is-warning'}">
            <div>
              <div class="fw-bold d-flex align-items-center gap-2">
                <i class="bi ${ms.health?.isDone ? 'bi-check-circle-fill text-success' : 'bi-exclamation-circle-fill text-warning'}"></i>
                4. น้ำหนัก-ส่วนสูง & ความเห็นครูประจำชั้น
              </div>
              <small class="text-muted ms-4">${ms.health?.isDone ? 'บันทึกครบถ้วน 2 ภาคเรียน' : 'บันทึกน้ำหนัก-ส่วนสูง เทอม 1-2 และความเห็นครู'}</small>
            </div>
            <button type="button" class="btn btn-sm ${ms.health?.isDone ? 'btn-outline-success' : 'btn-primary'}" onclick="document.getElementById('pp5HealthDoctorOverlay')?.remove();navigateTo('student_growth_entry');">
              ${ms.health?.isDone ? 'ดูข้อมูล' : 'ไปบันทึก'}
            </button>
          </div>

          <div class="health-status-card ${isReady ? 'is-pass' : ''}" style="${!isReady ? 'background:#f8fafc;border-color:#e2e8f0;' : ''}">
            <div>
              <div class="fw-bold d-flex align-items-center gap-2">
                <i class="bi ${isReady ? 'bi-printer-fill text-success' : 'bi-lock-fill text-secondary'}"></i>
                5. พิมพ์เอกสาร ปพ.5 / ปพ.6 / ส่งออก SchoolMIS
              </div>
              <small class="text-muted ms-4">${isReady ? 'พร้อมพิมพ์เล่ม ปพ.5 และ ปพ.6 ได้ทันที' : 'จะปลดล็อกอัตโนมัติเมื่อข้อมูลทั้ง 4 ด้านครบถ้วน'}</small>
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <button type="button" class="btn btn-sm ${isReady ? 'btn-success' : 'btn-outline-primary'}" onclick="if (window.GradeClassHelper?.saveSelection) window.GradeClassHelper.saveSelection('${data.grade}', '1'); document.getElementById('pp5HealthDoctorOverlay')?.remove(); navigateTo('pp5_full_book');">
                <i class="bi bi-journal-bookmark-fill"></i> พิมพ์ ปพ.5 รวมเล่ม
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="if (window.GradeClassHelper?.saveSelection) window.GradeClassHelper.saveSelection('${data.grade}', '1'); document.getElementById('pp5HealthDoctorOverlay')?.remove(); navigateTo('report_card_generator');">
                <i class="bi bi-file-earmark-person"></i> ปพ.6
              </button>
            </div>
          </div>
        </div>

        <div class="p-3 border-top bg-light d-flex justify-content-between align-items-center" style="border-radius: 0 0 20px 20px;">
          <small class="text-muted"><i class="bi bi-shield-check text-success"></i> ตรวจสอบมาตรฐานระเบียบวัดผล สพฐ.</small>
          <button type="button" class="btn btn-secondary btn-sm" id="btnDismissHealthDoctor">ปิด</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#btnCloseHealthDoctor')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#btnDismissHealthDoctor')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ดึงข้อมูลครั้งแรกเมื่อโหลดหน้า
  fetchProgress(currentActiveGrade);
}

/* ==========================================================================
   BULK ASSESSMENT HELPER (SMART PRESETS FOR 4 ASSESSMENTS)
   ========================================================================== */
// "ล้างค่า" บนแถบตั้งค่าเร็วเดิมล้างแค่ช่องบนหน้าจอ ผลที่บันทึกไว้ยังอยู่จนกว่าจะกดบันทึก
// ผู้ใช้จึงเข้าใจว่าล้างแล้วแต่ "กลับมาอีก" ฟังก์ชันนี้ถามแล้วลบผลที่บันทึกไว้ในระบบจริง
const PP5_PRESET_CLEAR_TYPES_ = {
  characteristic_assessment: { type: 'characteristic', label: 'ผลประเมินคุณลักษณะอันพึงประสงค์' },
  competency_assessment: { type: 'competency', label: 'ผลประเมินสมรรถนะสำคัญ (ทั้ง 5 ด้าน)' },
  activity_assessment: { type: 'activity', label: 'ผลกิจกรรมพัฒนาผู้เรียน' },
  read_think_write_form: { type: 'subject_rtw', label: 'ผลประเมินการอ่าน คิดวิเคราะห์ และเขียน (ราย 8 วิชา)' },
  rtw5_assessment: { type: 'rtw', label: 'ผลประเมินการอ่าน คิดวิเคราะห์ และเขียน (5 ข้อ)' }
};

function pp5OfferSavedAssessmentClear_(frame, pageName) {
  const target = PP5_PRESET_CLEAR_TYPES_[pageName];
  if (!target) return;
  const gradeSel = frame.querySelector('#gradeSelect');
  const classSel = frame.querySelector('#classSelect');
  const grade = gradeSel?.value || '';
  const classNo = classSel?.value || '';
  if (!grade || !classNo) return;
  const semesterSel = frame.querySelector('#semesterSelect');
  const semester = semesterSel && /^[12]$/.test(semesterSel.value) ? Number(semesterSel.value) : 1;
  const question = `ล้าง${target.label}\nของชั้น ${grade} ห้อง ${classNo} ภาคเรียนที่ ${semester} ที่บันทึกไว้ในระบบด้วยหรือไม่?\n\nตกลง = ลบออกจากระบบทันที (ใช้กับ ปพ.5/ปพ.6/รายงานทันที กู้คืนไม่ได้)\nยกเลิก = ล้างเฉพาะบนหน้าจอ (ผลเดิมยังอยู่จนกว่าจะกดบันทึก)`;
  if (!window.confirm(question)) return;
  if (typeof google === 'undefined' || !google.script || !google.script.run) {
    alert('ระบบยังไม่พร้อม กรุณาลองใหม่อีกครั้ง');
    return;
  }
  google.script.run
    .withSuccessHandler((result) => {
      alert(result?.message || 'ล้างผลประเมินเรียบร้อยแล้ว');
      // โหลดรายชื่อใหม่จากระบบให้หน้าจอตรงกับข้อมูลจริง
      if (classSel) classSel.dispatchEvent(new Event('change', { bubbles: true }));
    })
    .withFailureHandler((error) => {
      alert('ล้างผลประเมินในระบบไม่สำเร็จ: ' + (error?.message || error));
    })
    .clearAssessmentBatch({ type: target.type, grade, classNo, semester });
}

function enhanceSupabaseAssessmentPresetsPage_(pageName) {
  const frame = document.getElementById('contentFrame');
  if (!frame) return;

  const validPages = [
    'characteristic_assessment',
    'competency_assessment',
    'activity_assessment',
    'read_think_write_form',
    'rtw5_assessment'
  ];
  if (!validPages.includes(pageName)) return;

  function injectPresetBar() {
    if (frame.querySelector('#pp5AssessmentPresetBar')) return;

    const table = frame.querySelector('#studentsTableBody')?.closest('table') ||
      frame.querySelector('#communicationTableBody')?.closest('.tab-content') ||
      frame.querySelector('.assessment-table') ||
      frame.querySelector('table');
    if (!table) return;

    const bar = document.createElement('div');
    bar.id = 'pp5AssessmentPresetBar';
    bar.className = 'assessment-preset-bar animate-fade-in';

    let buttonsHtml = '';
    if (pageName === 'activity_assessment') {
      buttonsHtml = `
        <button type="button" class="preset-btn preset-btn-pass" data-val="ผ่าน">
          <i class="bi bi-check-circle-fill"></i> ผ่าน (ผ) ทั้งห้อง
        </button>
        <button type="button" class="preset-btn" data-val="ไม่ผ่าน">
          <i class="bi bi-x-circle"></i> ไม่ผ่าน (มผ) ทั้งห้อง
        </button>
        <button type="button" class="preset-btn" data-val="">
          <i class="bi bi-arrow-counterclockwise"></i> ล้างค่า
        </button>
      `;
    } else {
      buttonsHtml = `
        <button type="button" class="preset-btn preset-btn-excellent" data-val="3">
          <i class="bi bi-star-fill"></i> ดีเยี่ยม (3) ทั้งห้อง
        </button>
        <button type="button" class="preset-btn preset-btn-good" data-val="2">
          <i class="bi bi-hand-thumbs-up-fill"></i> ดี (2) ทั้งห้อง
        </button>
        <button type="button" class="preset-btn preset-btn-pass" data-val="1">
          <i class="bi bi-check2"></i> ผ่าน (1) ทั้งห้อง
        </button>
        <button type="button" class="preset-btn" data-val="">
          <i class="bi bi-arrow-counterclockwise"></i> ล้างค่า
        </button>
      `;
    }

    bar.innerHTML = `
      <div class="preset-btn-group">
        <span class="badge bg-primary text-white fw-bold d-flex align-items-center gap-1">
          <i class="bi bi-lightning-charge-fill"></i> ตั้งค่าเร็วทั้งห้อง:
        </span>
        ${buttonsHtml}
      </div>
      <small class="text-muted"><i class="bi bi-info-circle"></i> คลิกตั้งค่าทั้งห้อง แล้วเลื่อนปรับแก้เฉพาะคนที่ต้องพัฒนา</small>
    `;

    bar.querySelectorAll('button[data-val]').forEach(btn => {
      btn.addEventListener('click', function() {
        const targetVal = this.getAttribute('data-val');
        const container = frame.querySelector('#studentsTableBody') ||
          frame.querySelector('.tab-content .tab-pane.active tbody') ||
          frame.querySelector('tbody') ||
          frame;
        let updatedCount = 0;
        if (pageName === 'characteristic_assessment') {
          const students = container.querySelectorAll('tr[data-student-id]');
          const assessment = window.CharacteristicAssessment;
          if (students.length === 0 || typeof assessment?.setAllScores !== 'function') {
            alert('ยังไม่มีรายชื่อนักเรียนในตาราง กรุณาเลือกชั้นเรียนก่อน');
            return;
          }
          assessment.setAllScores(targetVal === '' ? '' : Number(targetVal));
          updatedCount = students.length * 8;
        } else if (pageName === 'competency_assessment') {
          const assessment = window.CompetencyAssessment;
          const inputs = container.querySelectorAll('input[type="number"]');
          if (inputs.length === 0 || typeof assessment?.fillAllCurrentTab !== 'function' || typeof assessment?.clearCurrentTab !== 'function') {
            alert('ยังไม่มีรายชื่อนักเรียนในตาราง กรุณาเลือกชั้นเรียนก่อน');
            return;
          }
          if (targetVal === '') assessment.clearCurrentTab();
          else assessment.fillAllCurrentTab(Number(targetVal));
          updatedCount = inputs.length;
        } else {
          const selects = Array.from(container.querySelectorAll('select:not(#gradeSelect):not(#classSelect):not(#semesterSelect):not(#topicSelect):not(#academicYearSelect)'));
          if (selects.length === 0) {
            alert('ยังไม่มีรายชื่อนักเรียนในตาราง กรุณาเลือกชั้นเรียนก่อน');
            return;
          }

          selects.forEach(sel => {
            const hasOption = Array.from(sel.options).some(o => o.value === targetVal);
            if (hasOption || targetVal === '') {
              sel.value = targetVal;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              sel.dispatchEvent(new Event('input', { bubbles: true }));
              updatedCount++;
            }
          });
        }

        if (typeof window.calculateTotalScore === 'function') try { window.calculateTotalScore(); } catch(_) {}
        if (typeof window.CharacteristicAssessment?.calculateTotal === 'function') try { window.CharacteristicAssessment.calculateTotal(); } catch(_) {}
        if (typeof window.ActivityAssessment?.calculateTotals === 'function') try { window.ActivityAssessment.calculateTotals(); } catch(_) {}

        if (targetVal === '') pp5OfferSavedAssessmentClear_(frame, pageName);

        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="bi bi-check-lg"></i> ปรับแล้ว ${updatedCount} ช่อง`;
        setTimeout(() => { btn.innerHTML = originalText; }, 1600);
      });
    });

    if (table.parentNode) {
      table.parentNode.insertBefore(bar, table);
    }
  }

  [150, 400, 900, 1800].forEach(delay => setTimeout(injectPresetBar, delay));
  pp5EnhanceAssessmentStudentList_(frame, pageName);
}

// ปุ่มเรียงลำดับ (เลขประจำตัว / ชาย→หญิง) และคอลัมน์ "เลขประจำตัว" สำหรับหน้าประเมินทั้ง 5 หน้า
// ทำงานกับแถวที่หน้าเว็บสร้างไว้ (tr[data-student-id]) จึงไม่เปลี่ยนวิธีบันทึกของแต่ละหน้า
// (ทุกหน้าบันทึกตามรหัสนักเรียน ไม่ใช่ตามลำดับแถว) และจำการเรียงไว้ในเครื่อง
const PP5_ASSESS_SORT_KEY_ = 'pp5_assessment_sort';

function pp5AssessSortMode_() {
  try { return localStorage.getItem(PP5_ASSESS_SORT_KEY_) || 'id'; } catch (_) { return 'id'; }
}

function pp5IsMaleStudentName_(name) {
  const value = String(name || '').trim();
  return value.indexOf('ชาย') !== -1 || value.indexOf('นาย') === 0;
}

// หน้าอ่านฯ ทั้ง 2 หน้าตรึงคอลัมน์ที่ 2 (ชื่อ) ไว้ซ้ายด้วย CSS nth-child(2)
// เมื่อแทรกเลขประจำตัวเป็นคอลัมน์ที่ 2 ต้องย้ายการตรึงไปที่คอลัมน์ชื่อ (ที่ 3)
function pp5EnsureSidColumnStyle_() {
  if (document.getElementById('pp5SidColumnStyle')) return;
  const style = document.createElement('style');
  style.id = 'pp5SidColumnStyle';
  style.textContent = `
    table.pp5-has-sid .pp5-sid-head, table.pp5-has-sid .pp5-sid-cell { text-align: center; white-space: nowrap; width: 90px; }
    table.pp5-has-sid .pp5-sid-cell { color: var(--bs-secondary-color, #64748b); font-variant-numeric: tabular-nums; }
    .rtw-page table.pp5-has-sid td:nth-child(2) { position: static; left: auto; z-index: auto; border-right: none; background-color: inherit; }
    .rtw-page table.pp5-has-sid thead tr:first-child th:nth-child(2) { left: auto; z-index: 10; border-right: none; }
    .rtw-page table.pp5-has-sid td:nth-child(3) { position: sticky; left: 0; z-index: 5; background-color: var(--rtw-surface); border-right: 1px solid var(--rtw-border); }
    /* เฉพาะแถวหัวแรก (มีหัว "ชื่อ-นามสกุล") — หน้าคุณลักษณะมีหัว 2 แถว และ th ที่ 3 ของแถวที่ 2
       เป็นหัวข้อประเมิน ซึ่งถ้าตรึงซ้ายด้วยจะลอยทับรายชื่อเมื่อเลื่อนตารางแนวนอนบนมือถือ */
    .rtw-page table.pp5-has-sid thead tr:first-child th:nth-child(3) { position: sticky; left: 0; z-index: 15; background-color: var(--rtw-surface-soft); border-right: 1px solid var(--rtw-border); }
  `;
  document.head.appendChild(style);
}

function pp5EnhanceAssessmentStudentList_(frame, pageName) {
  pp5EnsureSidColumnStyle_();
  if (window.__pp5AssessListObserver) {
    try { window.__pp5AssessListObserver.disconnect(); } catch (_) {}
    window.__pp5AssessListObserver = null;
  }
  let busy = false;
  let scheduled = false;

  const tbodies = () => Array.from(new Set(
    Array.from(frame.querySelectorAll('tr[data-student-id]')).map((row) => row.parentElement).filter((el) => el && el.tagName === 'TBODY')
  ));

  function addIdColumn(tbody) {
    const table = tbody.closest('table');
    if (!table) return;
    const headRow = table.tHead?.rows?.[0];
    if (headRow && !headRow.querySelector('.pp5-sid-head') && headRow.cells.length > 1) {
      const indexHead = headRow.cells[0];
      const th = document.createElement('th');
      th.className = 'pp5-sid-head';
      th.textContent = 'เลขประจำตัว';
      const rowSpan = indexHead.getAttribute('rowspan');
      if (rowSpan) th.setAttribute('rowspan', rowSpan);
      indexHead.after(th);
    }
    table.classList.add('pp5-has-sid');
    Array.from(tbody.rows).forEach((row) => {
      if (row.querySelector('.pp5-sid-cell')) return;
      if (!row.hasAttribute('data-student-id')) {
        const wide = row.cells.length === 1 ? row.cells[0] : null;
        if (wide && wide.colSpan > 1 && !wide.dataset.pp5SidSpan) { wide.colSpan += 1; wide.dataset.pp5SidSpan = '1'; }
        return;
      }
      if (row.cells.length < 2) return;
      const td = document.createElement('td');
      td.className = 'pp5-sid-cell';
      td.textContent = row.getAttribute('data-student-id') || '';
      row.cells[0].after(td);
    });
  }

  function sortRows(tbody, mode) {
    const rows = Array.from(tbody.querySelectorAll(':scope > tr[data-student-id]'));
    if (rows.length < 2) return;
    const key = (row) => String(row.getAttribute('data-student-id') || '');
    const sorted = rows.slice().sort((a, b) => {
      if (mode === 'gender') {
        const ma = pp5IsMaleStudentName_(a.getAttribute('data-name'));
        const mb = pp5IsMaleStudentName_(b.getAttribute('data-name'));
        if (ma !== mb) return ma ? -1 : 1;
      }
      return key(a).localeCompare(key(b), undefined, { numeric: true });
    });
    const changed = sorted.some((row, index) => row !== rows[index]);
    if (changed) sorted.forEach((row) => tbody.appendChild(row));
    sorted.forEach((row, index) => {
      const first = row.cells[0];
      if (first && /^\s*\d*\s*$/.test(first.textContent) && first.textContent.trim() !== String(index + 1)) first.textContent = String(index + 1);
    });
  }

  function injectSortButtons() {
    const bar = frame.querySelector('#pp5AssessmentPresetBar');
    if (!bar || bar.querySelector('.pp5-sort-group')) return;
    const group = document.createElement('div');
    group.className = 'pp5-sort-group d-flex align-items-center gap-1 flex-wrap';
    group.innerHTML = `
      <span class="small text-muted fw-semibold"><i class="bi bi-sort-down"></i> เรียง:</span>
      <button type="button" class="preset-btn" data-sort="id"><i class="bi bi-123"></i> เลขประจำตัว</button>
      <button type="button" class="preset-btn" data-sort="gender"><i class="bi bi-gender-ambiguous"></i> ชาย→หญิง</button>`;
    const firstGroup = bar.querySelector('.preset-btn-group');
    if (firstGroup) firstGroup.after(group); else bar.appendChild(group);
    group.querySelectorAll('button[data-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        try { localStorage.setItem(PP5_ASSESS_SORT_KEY_, btn.getAttribute('data-sort')); } catch (_) {}
        apply();
      });
    });
    // ปุ่มสลับการเรียงเดิมของแต่ละหน้าอยู่ท้ายตาราง (มองไม่เห็น) และสลับไปมา ให้ใช้ปุ่มบนแถบนี้แทน
    frame.querySelectorAll('button[onclick*="toggleSort"], button[onclick*="appToggleSort"]').forEach((old) => { old.style.display = 'none'; });
  }

  function markActive() {
    const mode = pp5AssessSortMode_();
    frame.querySelectorAll('.pp5-sort-group button[data-sort]').forEach((btn) => {
      const on = btn.getAttribute('data-sort') === mode;
      btn.classList.toggle('preset-btn-excellent', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function apply() {
    if (busy) return;
    busy = true;
    try {
      injectSortButtons();
      const mode = pp5AssessSortMode_();
      // หน้าที่ใช้ชิ้นส่วนกลาง (js/assessment-ui.js) แสดงรหัสใต้ชื่อพร้อมรูปแล้ว จึงไม่เพิ่มคอลัมน์เลขประจำตัว
      const assessmentUi = window.PP5AssessmentUI;
      const ownsIdentity = !!assessmentUi?.handles?.(pageName);
      tbodies().forEach((tbody) => { if (!ownsIdentity) addIdColumn(tbody); sortRows(tbody, mode); });
      if (ownsIdentity) assessmentUi.decorate(frame, pageName);
      markActive();
    } catch (error) {
      console.warn('assessment list enhance failed', error);
    } finally {
      busy = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (busy || scheduled) return;
    if (!frame.querySelector('#pp5AssessmentPresetBar') && !frame.querySelector('tr[data-student-id]')) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; apply(); }, 60);
  });
  observer.observe(frame, { childList: true, subtree: true });
  window.__pp5AssessListObserver = observer;
  [200, 600, 1200, 2000].forEach((delay) => setTimeout(apply, delay));
}

/* ==========================================================================
   PP.5 FULL BOOK PAGE ENHANCEMENT (UNIVERSAL AUTO-SELECT & QUICK ACTIONS)
   ========================================================================== */
function enhanceSupabasePp5FullBookPage_() {
  const frame = document.getElementById('contentFrame');
  if (!frame) return;

  function syncPp5FullBookSelectors() {
    const gradeSel = frame.querySelector('#pp5fbGrade');
    const classSel = frame.querySelector('#pp5fbClass');
    if (!gradeSel || !classSel) return;

    const saved = (window.GradeClassHelper && window.GradeClassHelper.loadSelection)
      ? window.GradeClassHelper.loadSelection()
      : null;
    const targetGrade = saved?.grade || 'ป.1';
    const targetClass = saved?.classNo || '1';

    // 1. Auto-select Grade if options are loaded
    if (gradeSel.options.length > 1 && (!gradeSel.value || gradeSel.value === '')) {
      const hasGrade = Array.from(gradeSel.options).some(o => o.value === targetGrade);
      if (hasGrade) {
        gradeSel.value = targetGrade;
        gradeSel.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof window.pp5fb_loadClasses === 'function') {
          window.pp5fb_loadClasses();
        }
      }
    }

    // 2. Auto-select Class/Room if options are loaded
    if (classSel.options.length > 1 && (!classSel.value || classSel.value === '')) {
      const hasRoom = Array.from(classSel.options).some(o => o.value === targetClass);
      if (hasRoom) {
        classSel.value = targetClass;
        classSel.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (classSel.options.length === 2 && classSel.options[1].value) {
        classSel.value = classSel.options[1].value;
        classSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // 3. Highlight generate button if both are ready
    const btn = frame.querySelector('#pp5fbBtn');
    if (btn && gradeSel.value && classSel.value && !btn.dataset.enhancedReady) {
      btn.dataset.enhancedReady = '1';
      btn.classList.add('shadow-lg');
    }
  }

  [120, 350, 750, 1500, 2500].forEach(delay => setTimeout(syncPp5FullBookSelectors, delay));
}

/* ==========================================================================
   E-SIGNATURES & DIGITAL STAMP MANAGER (DRAWPAD + UPLOAD + AUTO-STAMP)
   ========================================================================== */
function showSignaturePadModal_(title, onSave) {
  document.getElementById('pp5SigPadOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pp5SigPadOverlay';
  overlay.className = 'modal fade show d-flex align-items-center justify-content-center';
  overlay.style.cssText = 'background: rgba(0,0,0,0.55); position: fixed; inset: 0; z-index: 10050; padding: 15px;';

  overlay.innerHTML = `
    <div class="modal-dialog modal-dialog-centered" style="max-width: 480px; width: 100%;">
      <div class="modal-content shadow-lg border-0" style="border-radius: 20px; overflow: hidden;">
        <div class="modal-header bg-light py-3 px-4">
          <h6 class="modal-title fw-bold text-primary mb-0">
            <i class="bi bi-pen me-2"></i>วาดลายเซ็นดิจิทัล: ${title}
          </h6>
          <button type="button" class="btn-close btn-sm" id="btnCloseSigPad"></button>
        </div>
        <div class="modal-body p-4 text-center">
          <div class="text-muted small mb-2 text-start">
            <i class="bi bi-hand-index-thumb me-1"></i>ใช้นิ้วมือ ปากกา หรือเมาส์เขียนลายมือชื่อลงในกรอบด้านล่าง:
          </div>
          <div class="border rounded-3 position-relative" style="background: #ffffff; box-shadow: inset 0 2px 4px rgba(0,0,0,0.06);">
            <canvas id="pp5SigCanvas" width="420" height="180" style="touch-action: none; width: 100%; height: 180px; display: block; border-radius: 12px; cursor: crosshair;"></canvas>
            <div style="position: absolute; bottom: 8px; left: 12px; font-size: 11px; color: #94a3b8; pointer-events: none;">
              ...........................................................................
            </div>
          </div>
          <div class="d-flex justify-content-between align-items-center mt-3">
            <div class="d-flex gap-2 align-items-center">
              <span class="small text-muted">สีหมึก:</span>
              <button type="button" class="btn btn-sm btn-outline-dark active rounded-circle p-0" id="btnColorBlue" style="width:24px;height:24px;background:#1a365d;border-color:#1a365d;" title="น้ำเงินกรมท่า"></button>
              <button type="button" class="btn btn-sm btn-outline-dark rounded-circle p-0" id="btnColorBlack" style="width:24px;height:24px;background:#111827;border-color:#111827;" title="ดำ"></button>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="btnClearSigCanvas">
              <i class="bi bi-eraser me-1"></i>ล้างกระดาน
            </button>
          </div>
        </div>
        <div class="modal-footer bg-light py-2 px-4 d-flex justify-content-between">
          <button type="button" class="btn btn-secondary btn-sm px-3" id="btnCancelSigPad">ยกเลิก</button>
          <button type="button" class="btn btn-primary btn-sm px-4 fw-bold" id="btnApplySigCanvas">
            <i class="bi bi-check-lg me-1"></i>ใช้ลายเซ็นนี้
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const canvas = overlay.querySelector('#pp5SigCanvas');
  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let hasDrawn = false;
  let strokeColor = '#1a365d';

  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = strokeColor;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches && e.touches.length) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawing = true;
    hasDrawn = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function moveDraw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function stopDraw(e) {
    if (!isDrawing) return;
    isDrawing = false;
    ctx.closePath();
  }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', moveDraw);
  window.addEventListener('mouseup', stopDraw);

  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', moveDraw, { passive: false });
  window.addEventListener('touchend', stopDraw);

  overlay.querySelector('#btnColorBlue')?.addEventListener('click', () => {
    strokeColor = '#1a365d';
    ctx.strokeStyle = strokeColor;
  });
  overlay.querySelector('#btnColorBlack')?.addEventListener('click', () => {
    strokeColor = '#111827';
    ctx.strokeStyle = strokeColor;
  });

  overlay.querySelector('#btnClearSigCanvas')?.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn = false;
  });

  const close = () => {
    window.removeEventListener('mouseup', stopDraw);
    window.removeEventListener('touchend', stopDraw);
    overlay.remove();
  };

  overlay.querySelector('#btnCloseSigPad')?.addEventListener('click', close);
  overlay.querySelector('#btnCancelSigPad')?.addEventListener('click', close);

  overlay.querySelector('#btnApplySigCanvas')?.addEventListener('click', () => {
    if (!hasDrawn) {
      alert('กรุณาวาดลายเซ็นก่อนกดใช้ลายเซ็น');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    close();
    if (typeof onSave === 'function') onSave(dataUrl);
  });
}

function initSignaturesManagerLogic_(card) {
  const toggle = card.querySelector('#pp5IncludeSigToggle');
  const imgDirector = card.querySelector('#sigPreviewDirector');
  const phDirector = card.querySelector('#sigPlaceholderDirector');
  const clearDirector = card.querySelector('#btnClearDirectorSig');
  const fileDirector = card.querySelector('#fileInputDirectorSig');

  const imgAcademic = card.querySelector('#sigPreviewAcademicHead');
  const phAcademic = card.querySelector('#sigPlaceholderAcademicHead');
  const clearAcademic = card.querySelector('#btnClearAcademicHeadSig');
  const fileAcademic = card.querySelector('#fileInputAcademicHeadSig');

  const imgStamp = card.querySelector('#sigPreviewStamp');
  const phStamp = card.querySelector('#sigPlaceholderStamp');
  const clearStamp = card.querySelector('#btnClearStamp');
  const fileStamp = card.querySelector('#fileInputStamp');

  const imgTeacher = card.querySelector('#sigPreviewTeacher');
  const phTeacher = card.querySelector('#sigPlaceholderTeacher');
  const clearTeacher = card.querySelector('#btnClearTeacherSig');
  const fileTeacher = card.querySelector('#fileInputTeacherSig');
  const roomSelectTeacher = card.querySelector('#teacherSigRoomSelect');
  const badgeTeacher = card.querySelector('#sigTeacherStatusBadge');

  const state = {
    director: '',
    academicHead: '',
    schoolStamp: '',
    teacher: '',
    teachers: {},
    includeSignatures: true
  };

  function updateSlotUi(imgEl, phEl, clearEl, val) {
    if (val && typeof val === 'string' && val.trim()) {
      imgEl.src = val;
      imgEl.style.display = 'block';
      phEl.style.display = 'none';
      clearEl.style.display = 'inline-block';
    } else {
      imgEl.src = '';
      imgEl.style.display = 'none';
      phEl.style.display = 'block';
      clearEl.style.display = 'none';
    }
  }

  function getSelectedTeacherRoom() {
    return roomSelectTeacher ? roomSelectTeacher.value : 'default';
  }

  function getTeacherSigForRoom(room) {
    if (room === 'default') {
      return state.teacher || state.teachers['default'] || '';
    }
    return state.teachers[room] || '';
  }

  function refreshRoomSelectLabels() {
    if (!roomSelectTeacher) return;
    const currentSelected = getSelectedTeacherRoom();
    Array.from(roomSelectTeacher.options).forEach((opt) => {
      const val = opt.value;
      const baseLabel = val === 'default' ? '⭐ ทุกห้อง (ค่าเริ่มต้น)' : val;
      const hasSig = !!getTeacherSigForRoom(val);
      opt.textContent = hasSig ? `${baseLabel} (✓)` : baseLabel;
    });

    const summaryList = card.querySelector('#teacherRoomsSummaryList');
    if (summaryList) {
      const rooms = ['default', 'อ.1/1', 'อ.2/1', 'อ.3/1', 'ป.1/1', 'ป.2/1', 'ป.3/1', 'ป.4/1', 'ป.5/1', 'ป.6/1'];
      summaryList.innerHTML = rooms.map((r) => {
        const hasSig = !!getTeacherSigForRoom(r);
        const isCurrent = r === currentSelected;
        const label = r === 'default' ? '⭐ ค่าเริ่มต้นทุกห้อง' : r;
        const btnClass = isCurrent 
          ? 'btn-primary text-white shadow-sm' 
          : (hasSig ? 'btn-outline-success bg-white' : 'btn-outline-secondary bg-white');
        const icon = hasSig ? '<i class="bi bi-check-circle-fill text-success me-1"></i>' : '<i class="bi bi-dash-circle text-muted me-1"></i>';
        return `<button type="button" class="btn btn-sm ${btnClass} d-inline-flex align-items-center fw-bold py-1 px-2" data-room="${r}" style="font-size:0.8rem;border-radius:8px;">
          ${icon}${label} ${hasSig ? '<span class="badge bg-success ms-1" style="font-size:0.65rem;">มีลายเซ็นแล้ว</span>' : '<span class="badge bg-light text-muted ms-1 border" style="font-size:0.65rem;">ยังไม่มี</span>'}
        </button>`;
      }).join('');

      summaryList.querySelectorAll('button[data-room]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetRoom = btn.getAttribute('data-room');
          if (roomSelectTeacher) {
            roomSelectTeacher.value = targetRoom;
            updateTeacherSlotUi();
          }
        });
      });
    }
  }

  function updateTeacherSlotUi() {
    const room = getSelectedTeacherRoom();
    const sig = getTeacherSigForRoom(room);
    updateSlotUi(imgTeacher, phTeacher, clearTeacher, sig);
    if (badgeTeacher) {
      if (sig) {
        badgeTeacher.className = 'badge bg-success';
        badgeTeacher.textContent = 'มีลายเซ็นแล้ว';
      } else {
        badgeTeacher.className = 'badge bg-secondary';
        badgeTeacher.textContent = 'ยังไม่มี';
      }
    }
    refreshRoomSelectLabels();
  }

  function handleFileUpload(fileInput, onLoaded) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert('ขนาดไฟล์เกิน 2MB กรุณาเลือกไฟล์ขนาดเล็กลง');
        fileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (re) => {
        onLoaded(re.target?.result || '');
        fileInput.value = '';
      };
      reader.readAsDataURL(file);
    });
  }

  handleFileUpload(fileDirector, (dataUrl) => {
    state.director = dataUrl;
    updateSlotUi(imgDirector, phDirector, clearDirector, dataUrl);
  });
  handleFileUpload(fileAcademic, (dataUrl) => {
    state.academicHead = dataUrl;
    updateSlotUi(imgAcademic, phAcademic, clearAcademic, dataUrl);
  });
  handleFileUpload(fileStamp, (dataUrl) => {
    state.schoolStamp = dataUrl;
    updateSlotUi(imgStamp, phStamp, clearStamp, dataUrl);
  });
  handleFileUpload(fileTeacher, (dataUrl) => {
    const room = getSelectedTeacherRoom();
    state.teachers[room] = dataUrl;
    if (room === 'default') {
      state.teacher = dataUrl;
    }
    updateTeacherSlotUi();
  });

  roomSelectTeacher?.addEventListener('change', () => {
    updateTeacherSlotUi();
  });

  card.querySelector('#btnUploadDirectorSig')?.addEventListener('click', () => fileDirector.click());
  card.querySelector('#btnUploadAcademicHeadSig')?.addEventListener('click', () => fileAcademic.click());
  card.querySelector('#btnUploadStamp')?.addEventListener('click', () => fileStamp.click());
  card.querySelector('#btnUploadTeacherSig')?.addEventListener('click', () => fileTeacher.click());

  card.querySelector('#btnDrawDirectorSig')?.addEventListener('click', () => {
    showSignaturePadModal_('ผู้อำนวยการโรงเรียน', (dataUrl) => {
      state.director = dataUrl;
      updateSlotUi(imgDirector, phDirector, clearDirector, dataUrl);
    });
  });
  card.querySelector('#btnDrawAcademicHeadSig')?.addEventListener('click', () => {
    showSignaturePadModal_('หัวหน้าฝ่ายวิชาการ', (dataUrl) => {
      state.academicHead = dataUrl;
      updateSlotUi(imgAcademic, phAcademic, clearAcademic, dataUrl);
    });
  });
  card.querySelector('#btnDrawTeacherSig')?.addEventListener('click', () => {
    const room = getSelectedTeacherRoom();
    const roomLabel = room === 'default' ? 'ครูประจำชั้น (ค่าเริ่มต้นทุกห้อง)' : `ครูประจำชั้นห้อง ${room}`;
    showSignaturePadModal_(roomLabel, (dataUrl) => {
      state.teachers[room] = dataUrl;
      if (room === 'default') {
        state.teacher = dataUrl;
      }
      updateTeacherSlotUi();
    });
  });

  clearDirector?.addEventListener('click', () => {
    state.director = '';
    updateSlotUi(imgDirector, phDirector, clearDirector, '');
  });
  clearAcademic?.addEventListener('click', () => {
    state.academicHead = '';
    updateSlotUi(imgAcademic, phAcademic, clearAcademic, '');
  });
  clearStamp?.addEventListener('click', () => {
    state.schoolStamp = '';
    updateSlotUi(imgStamp, phStamp, clearStamp, '');
  });
  clearTeacher?.addEventListener('click', () => {
    const room = getSelectedTeacherRoom();
    state.teachers[room] = '';
    if (room === 'default') {
      state.teacher = '';
      state.teachers.default = '';
    }
    updateTeacherSlotUi();
  });

  if (typeof google !== 'undefined' && google.script?.run) {
    google.script.run
      .withSuccessHandler((sigs) => {
        if (!sigs) return;
        state.director = sigs.director || '';
        state.academicHead = sigs.academicHead || '';
        state.schoolStamp = sigs.schoolStamp || '';
        state.teachers = (sigs.teachers && typeof sigs.teachers === 'object') ? { ...sigs.teachers } : {};
        state.teacher = sigs.teacher || (typeof sigs.teachers === 'string' ? sigs.teachers : sigs.teachers?.default) || '';
        if (state.teacher && !state.teachers.default) {
          state.teachers.default = state.teacher;
        }
        state.includeSignatures = sigs.includeSignatures !== false;

        if (toggle) toggle.checked = state.includeSignatures;
        updateSlotUi(imgDirector, phDirector, clearDirector, state.director);
        updateSlotUi(imgAcademic, phAcademic, clearAcademic, state.academicHead);
        updateSlotUi(imgStamp, phStamp, clearStamp, state.schoolStamp);
        updateTeacherSlotUi();
      })
      .getSchoolSignatures();
  }

  const btnSave = card.querySelector('#btnSaveAllSignatures');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      btnSave.disabled = true;
      btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังบันทึก...';

      const payload = {
        director: state.director,
        academicHead: state.academicHead,
        schoolStamp: state.schoolStamp,
        teacher: state.teacher || state.teachers?.default || '',
        teachers: state.teachers,
        replaceTeachers: true,
        includeSignatures: toggle ? toggle.checked : true
      };

      if (typeof google !== 'undefined' && google.script?.run) {
        google.script.run
          .withSuccessHandler(() => {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="bi bi-check-lg me-1"></i>บันทึกเรียบร้อยแล้ว';
            setTimeout(() => {
              btnSave.innerHTML = '<i class="bi bi-floppy2-fill me-1"></i>บันทึกลายเซ็นและตราประทับ';
            }, 2000);
          })
          .withFailureHandler((err) => {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="bi bi-floppy2-fill me-1"></i>บันทึกลายเซ็นและตราประทับ';
            alert('บันทึกลายเซ็นไม่สำเร็จ: ' + (err.message || err));
          })
          .saveSchoolSignatures(payload);
      }
    });
  }
}

function enhanceSupabaseSignaturesManager_() {
  const container = document.getElementById('new_settings_editor') || document.querySelector('.settings-container') || document.getElementById('contentFrame');
  if (!container || document.getElementById('pp5SignaturesManagerCard')) return;

  const card = document.createElement('div');
  card.id = 'pp5SignaturesManagerCard';
  card.className = 'card mt-4 border-0 shadow-sm';
  card.style.borderRadius = '16px';
  card.innerHTML = `
    <div class="card-header bg-white border-0 pt-4 px-4 pb-0 d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div>
        <h5 class="fw-bold mb-1 text-primary">
          <i class="bi bi-pen-fill me-2"></i>ระบบลายเซ็นอิเล็กทรอนิกส์และตราประทับดิจิทัล (Digital Signatures & School Stamp)
        </h5>
        <div class="text-muted small">
          ประทับลายมือชื่อผู้บริหาร ครูประจำชั้น และตราโรงเรียนลงในเอกสาร ปพ.5 รวมเล่ม และ ปพ.6 อัตโนมัติ
        </div>
      </div>
      <div class="form-check form-switch fs-6">
        <input class="form-check-input" type="checkbox" id="pp5IncludeSigToggle" checked>
        <label class="form-check-label small fw-bold" for="pp5IncludeSigToggle">เปิดใช้งานการประทับลายเซ็นในเอกสาร</label>
      </div>
    </div>
    <div class="card-body p-4">
      <div class="row g-3">
        <!-- 1. ผู้อำนวยการโรงเรียน -->
        <div class="col-12 col-md-6 col-lg-3">
          <div class="p-3 border rounded-3 text-center h-100 bg-light d-flex flex-column justify-content-between">
            <div>
              <span class="badge bg-primary mb-2">ผู้อำนวยการโรงเรียน</span>
              <div class="fw-bold small text-truncate" id="sigDirectorLabel">ผู้อำนวยการสถานศึกษา</div>
              <div class="my-2 border rounded bg-white d-flex align-items-center justify-content-center position-relative" style="height: 110px; overflow: hidden;">
                <img id="sigPreviewDirector" src="" alt="ลายเซ็น ผอ." style="max-height: 90px; max-width: 95%; display: none; object-fit: contain;">
                <span id="sigPlaceholderDirector" class="text-muted small"><i class="bi bi-file-earmark-image d-block fs-3"></i>ยังไม่มีลายเซ็น</span>
              </div>
            </div>
            <div class="d-flex flex-column gap-1 mt-2">
              <div class="btn-group btn-group-sm w-100">
                <button type="button" class="btn btn-outline-primary" id="btnUploadDirectorSig"><i class="bi bi-upload me-1"></i>อัปโหลด</button>
                <button type="button" class="btn btn-primary" id="btnDrawDirectorSig"><i class="bi bi-pencil me-1"></i>วาด</button>
              </div>
              <button type="button" class="btn btn-outline-danger btn-sm w-100" id="btnClearDirectorSig" style="display:none;"><i class="bi bi-trash me-1"></i>ลบ</button>
              <input type="file" id="fileInputDirectorSig" accept="image/png,image/jpeg" style="display:none;">
            </div>
          </div>
        </div>

        <!-- 2. หัวหน้าฝ่ายวิชาการ -->
        <div class="col-12 col-md-6 col-lg-3">
          <div class="p-3 border rounded-3 text-center h-100 bg-light d-flex flex-column justify-content-between">
            <div>
              <span class="badge bg-info text-dark mb-2">หัวหน้าฝ่ายวิชาการ</span>
              <div class="fw-bold small text-truncate" id="sigAcademicHeadLabel">หัวหน้างานวิชาการ/วัดผล</div>
              <div class="my-2 border rounded bg-white d-flex align-items-center justify-content-center position-relative" style="height: 110px; overflow: hidden;">
                <img id="sigPreviewAcademicHead" src="" alt="ลายเซ็นวิชาการ" style="max-height: 90px; max-width: 95%; display: none; object-fit: contain;">
                <span id="sigPlaceholderAcademicHead" class="text-muted small"><i class="bi bi-file-earmark-image d-block fs-3"></i>ยังไม่มีลายเซ็น</span>
              </div>
            </div>
            <div class="d-flex flex-column gap-1 mt-2">
              <div class="btn-group btn-group-sm w-100">
                <button type="button" class="btn btn-outline-primary" id="btnUploadAcademicHeadSig"><i class="bi bi-upload me-1"></i>อัปโหลด</button>
                <button type="button" class="btn btn-primary" id="btnDrawAcademicHeadSig"><i class="bi bi-pencil me-1"></i>วาด</button>
              </div>
              <button type="button" class="btn btn-outline-danger btn-sm w-100" id="btnClearAcademicHeadSig" style="display:none;"><i class="bi bi-trash me-1"></i>ลบ</button>
              <input type="file" id="fileInputAcademicHeadSig" accept="image/png,image/jpeg" style="display:none;">
            </div>
          </div>
        </div>

        <!-- 3. ตราประทับโรงเรียน -->
        <div class="col-12 col-md-6 col-lg-3">
          <div class="p-3 border rounded-3 text-center h-100 bg-light d-flex flex-column justify-content-between">
            <div>
              <span class="badge bg-warning text-dark mb-2">ตราประทับโรงเรียน</span>
              <div class="fw-bold small text-truncate">ตราประทับทางการ (สพฐ.)</div>
              <div class="my-2 border rounded bg-white d-flex align-items-center justify-content-center position-relative" style="height: 110px; overflow: hidden;">
                <img id="sigPreviewStamp" src="" alt="ตราประทับ" style="max-height: 90px; max-width: 95%; display: none; object-fit: contain;">
                <span id="sigPlaceholderStamp" class="text-muted small"><i class="bi bi-shield-shaded d-block fs-3"></i>ยังไม่มีตราประทับ</span>
              </div>
            </div>
            <div class="d-flex flex-column gap-1 mt-2">
              <button type="button" class="btn btn-outline-primary btn-sm w-100" id="btnUploadStamp"><i class="bi bi-upload me-1"></i>อัปโหลดตราประทับ (PNG)</button>
              <button type="button" class="btn btn-outline-danger btn-sm w-100" id="btnClearStamp" style="display:none;"><i class="bi bi-trash me-1"></i>ลบ</button>
              <input type="file" id="fileInputStamp" accept="image/png,image/jpeg" style="display:none;">
            </div>
          </div>
        </div>

        <!-- 4. ครูประจำชั้น (แยกรายห้อง / ค่าเริ่มต้น) -->
        <div class="col-12 col-md-6 col-lg-3">
          <div class="p-3 border rounded-3 text-center h-100 bg-light d-flex flex-column justify-content-between">
            <div>
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="badge bg-success">ครูประจำชั้น</span>
                <span id="sigTeacherStatusBadge" class="badge bg-secondary" style="font-size:0.7rem;">ยังไม่มี</span>
              </div>
              <div class="mb-2 text-start">
                <label for="teacherSigRoomSelect" class="form-label small text-muted mb-1" style="font-size:0.75rem;">เลือกระดับชั้น/ห้อง:</label>
                <select id="teacherSigRoomSelect" class="form-select form-select-sm fw-bold text-primary" style="font-size:0.8rem;">
                  <option value="default">⭐ ทุกห้อง (ค่าเริ่มต้น)</option>
                  <option value="อ.1/1">อ.1/1</option>
                  <option value="อ.2/1">อ.2/1</option>
                  <option value="อ.3/1">อ.3/1</option>
                  <option value="ป.1/1">ป.1/1</option>
                  <option value="ป.2/1">ป.2/1</option>
                  <option value="ป.3/1">ป.3/1</option>
                  <option value="ป.4/1">ป.4/1</option>
                  <option value="ป.5/1">ป.5/1</option>
                  <option value="ป.6/1">ป.6/1</option>
                </select>
              </div>
              <div class="my-2 border rounded bg-white d-flex align-items-center justify-content-center position-relative" style="height: 110px; overflow: hidden;">
                <img id="sigPreviewTeacher" src="" alt="ลายเซ็นครู" style="max-height: 90px; max-width: 95%; display: none; object-fit: contain;">
                <span id="sigPlaceholderTeacher" class="text-muted small"><i class="bi bi-file-earmark-image d-block fs-3"></i>ยังไม่มีลายเซ็น</span>
              </div>
            </div>
            <div class="d-flex flex-column gap-1 mt-2">
              <div class="btn-group btn-group-sm w-100">
                <button type="button" class="btn btn-outline-primary" id="btnUploadTeacherSig"><i class="bi bi-upload me-1"></i>อัปโหลด</button>
                <button type="button" class="btn btn-primary" id="btnDrawTeacherSig"><i class="bi bi-pencil me-1"></i>วาด</button>
              </div>
              <button type="button" class="btn btn-outline-danger btn-sm w-100" id="btnClearTeacherSig" style="display:none;"><i class="bi bi-trash me-1"></i>ลบ</button>
              <input type="file" id="fileInputTeacherSig" accept="image/png,image/jpeg" style="display:none;">
            </div>
          </div>
      </div>

      <!-- แถบเลือกห้องและสถานะครูประจำชั้นรายห้องอย่างชัดเจน -->
      <div class="mt-4 p-3 border rounded-3 bg-light">
        <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
          <div class="fw-bold text-dark small">
            <i class="bi bi-people-fill text-primary me-1"></i>สถานะลายเซ็นครูประจำชั้นแยกตามระดับชั้น (อ.1/1 - ป.6/1):
          </div>
          <span class="text-muted small" style="font-size:0.75rem;"><i class="bi bi-cursor-fill text-primary me-1"></i>คลิกปุ่มห้องเพื่อสลับไปวาดหรืออัปโหลดลายเซ็นในกล่องด้านบน</span>
        </div>
        <div class="d-flex flex-wrap gap-2" id="teacherRoomsSummaryList"></div>
      </div>

      <div class="mt-4 pt-3 border-top d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div class="text-muted small">
          <i class="bi bi-shield-check text-success me-1"></i>แนะนำให้ใช้ภาพลายเซ็นพื้นหลังโปร่งใส (Transparent PNG) เพื่อความสวยงามกลมกลืนกับเอกสารราชการ
        </div>
        <button type="button" class="btn btn-primary px-4 fw-bold shadow-sm" id="btnSaveAllSignatures">
          <i class="bi bi-floppy2-fill me-1"></i>บันทึกลายเซ็นและตราประทับ
        </button>
      </div>
    </div>
  `;

  // หน้าตั้งค่าระบบกลาง: ลายเซ็นเป็นแท็บของตัวเอง (owner 2026-10-14: "ส่วนลายเซ็นอยู่ทุกหน้าเลย")
  // ไม่ต้องมีแบนเนอร์ "ไปที่ส่วนจัดการลายเซ็น" อีก เพราะแท็บอยู่ในแถบด้านบนแล้ว
  const settingsNav = document.getElementById('settingsTab');
  const settingsContent = document.getElementById('settingsTabContent');
  if (settingsNav && settingsContent) {
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.setAttribute('role', 'presentation');
    li.innerHTML = '<button class="nav-link" id="signatures-tab" data-bs-toggle="pill" data-bs-target="#signaturesTabPane" type="button" role="tab" aria-controls="signaturesTabPane" aria-selected="false">'
      + '<i class="bi bi-pen"></i> ลายเซ็น & ตราประทับ</button>';
    settingsNav.appendChild(li);
    const pane = document.createElement('div');
    pane.className = 'tab-pane fade';
    pane.id = 'signaturesTabPane';
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', 'signatures-tab');
    card.classList.remove('mt-4');
    pane.appendChild(card);
    settingsContent.appendChild(pane);
    initSignaturesManagerLogic_(card);
    return;
  }

  const targetParent = container.querySelector('.container') || container.querySelector('.settings-form') || container;
  const saveBar = targetParent.querySelector('.sticky-savebar') || container.querySelector('.sticky-savebar');
  if (saveBar) {
    saveBar.parentNode.insertBefore(card, saveBar);
  } else {
    targetParent.appendChild(card);
  }

  // แบนเนอร์ด้านบนสุดแจ้งให้ทราบทันทีว่ามีส่วนลายเซ็น
  if (!document.getElementById('pp5SigTopBanner')) {
    const topBanner = document.createElement('div');
    topBanner.id = 'pp5SigTopBanner';
    topBanner.className = 'alert alert-primary d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4 border-0 shadow-sm';
    topBanner.style.cssText = 'border-radius: 16px; background: linear-gradient(135deg, color-mix(in srgb, var(--primary-light) 9%, #fff) 0%, color-mix(in srgb, var(--primary-light) 16%, #fff) 100%); border-left: 6px solid var(--primary) !important;';
    topBanner.innerHTML = `
      <div class="d-flex align-items-center gap-3">
        <div class="d-flex align-items-center justify-content-center bg-white rounded-circle shadow-xs" style="width:42px;height:42px;">
          <i class="bi bi-pen-fill text-primary fs-5"></i>
        </div>
        <div>
          <strong class="text-primary fs-6">ระบบลายเซ็นอิเล็กทรอนิกส์ & ตราประทับดิจิทัล (Digital Signatures & Stamp)</strong>
          <div class="text-muted small">ลงลายมือชื่อ ผอ., วิชาการ, ตราประทับ และครูประจำชั้นทุกห้อง (อ.1 - ป.6) ลงใน ปพ.5 และ ปพ.6</div>
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-sm fw-bold px-3 py-2 shadow-sm" id="btnScrollToSigs" style="border-radius: 10px;">
        <i class="bi bi-arrow-down-circle-fill me-1"></i>ไปที่ส่วนจัดการลายเซ็น ↓
      </button>
    `;
    const header = targetParent.querySelector('.page-header') || targetParent.firstChild;
    if (header && header.nextSibling) {
      targetParent.insertBefore(topBanner, header.nextSibling);
    } else {
      targetParent.insertBefore(topBanner, targetParent.firstChild);
    }
    topBanner.querySelector('#btnScrollToSigs')?.addEventListener('click', () => {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  initSignaturesManagerLogic_(card);
}

/* ==========================================================================
   SAR ACADEMIC ANALYTICS DASHBOARD & EXPORTER MODAL
   ========================================================================== */
function showSarAnalyticsModal_(academicYear) {
  document.getElementById('pp5SarAnalyticsOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pp5SarAnalyticsOverlay';
  overlay.className = 'modal fade show d-flex align-items-center justify-content-center';
  overlay.style.cssText = 'background: rgba(0,0,0,0.6); position: fixed; inset: 0; z-index: 10050; padding: 15px; overflow-y: auto;';

  const defaultYear = academicYear || '2569';

  overlay.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-xl" style="max-width: 960px; width: 100%; margin: auto;">
      <div class="modal-content shadow-lg border-0" style="border-radius: 20px; overflow: hidden;">
        <div class="modal-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-file-earmark-bar-graph-fill text-primary" style="font-size: 1.6rem;"></i>
            <div>
              <h5 class="modal-title fw-bold text-primary mb-0">
                รายงานการประเมินตนเองของสถานศึกษา (SAR)
              </h5>
              <small class="text-muted">วิเคราะห์ผลสัมฤทธิ์ทางการเรียน 8 กลุ่มสาระ และผลการประเมินพัฒนาการ 4 ด้าน</small>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <label for="sarYearSelect" class="small fw-bold text-muted mb-0">ปีการศึกษา:</label>
            <select id="sarYearSelect" class="form-select form-select-sm" style="width: 100px;">
              <option value="2569" ${defaultYear === '2569' ? 'selected' : ''}>2569</option>
              <option value="2568" ${defaultYear === '2568' ? 'selected' : ''}>2568</option>
              <option value="2567" ${defaultYear === '2567' ? 'selected' : ''}>2567</option>
            </select>
            <button type="button" class="btn-close btn-sm ms-2" id="btnCloseSarModal" aria-label="ปิด"></button>
          </div>
        </div>

        <div class="modal-body p-4" id="sarModalContent">
          <div class="text-center py-5 text-muted">
            <span class="spinner-border spinner-border-sm me-2"></span>กำลังประมวลผลข้อมูล SAR...
          </div>
        </div>

        <div class="modal-footer bg-light py-2 px-4 d-flex justify-content-between">
          <div class="text-muted small">
            <i class="bi bi-shield-check text-success me-1"></i>โครงสร้างรายงานสอดคล้องตามเกณฑ์มาตรฐานการประกันคุณภาพภายใน สมศ. และ สพฐ.
          </div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-secondary btn-sm px-3" id="btnDismissSarModal">ปิด</button>
            <button type="button" class="btn btn-primary btn-sm px-3 fw-bold" id="btnExportSarPdf">
              <i class="bi bi-printer-fill me-1"></i>ดาวน์โหลดรายงาน SAR (PDF)
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#btnCloseSarModal')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btnDismissSarModal')?.addEventListener('click', () => overlay.remove());

  function loadSarData(year) {
    const body = overlay.querySelector('#sarModalContent');
    if (!body) return;
    body.innerHTML = `
      <div class="text-center py-5 text-muted">
        <span class="spinner-border spinner-border-sm me-2"></span>กำลังคำนวณสถิติและแจกแจงระดับผลการเรียนปี ${year}...
      </div>
    `;

    if (typeof google !== 'undefined' && google.script?.run) {
      google.script.run
        .withSuccessHandler((data) => renderSarBody(data, year))
        .withFailureHandler((err) => {
          body.innerHTML = `<div class="alert alert-danger">เกิดข้อผิดพลาด: ${err.message || err}</div>`;
        })
        .computeSchoolSarAnalytics(year);
    }
  }

  function renderSarBody(data, year) {
    const body = overlay.querySelector('#sarModalContent');
    if (!body) return;
    const areas = data.subjectAreas || [];
    const assess = data.assessments || {};
    const totStudents = data.totalStudents || 0;

    let goodSum = 0;
    let evalSum = 0;
    let gpaSum = 0;
    let gpaCount = 0;

    areas.forEach((a) => {
      const tot = Number(a.total || 0);
      if (tot > 0) {
        goodSum += (a.goodPlus || 0);
        evalSum += tot;
        if (a.meanGpa && a.meanGpa !== '-' && !isNaN(Number(a.meanGpa))) {
          gpaSum += Number(a.meanGpa);
          gpaCount += 1;
        }
      }
    });

    const overallPct = evalSum > 0 ? ((goodSum / evalSum) * 100).toFixed(1) + '%' : '-';
    const overallGpa = gpaCount > 0 ? (gpaSum / gpaCount).toFixed(2) : '-';

    const dimPass = (assess.reading?.pass || 0) + (assess.reading?.good || 0) + (assess.reading?.excellent || 0)
      + (assess.character?.pass || 0) + (assess.character?.good || 0) + (assess.character?.excellent || 0)
      + (assess.activity?.pass || 0)
      + (assess.competency?.pass || 0) + (assess.competency?.good || 0) + (assess.competency?.excellent || 0);

    const dimTotal = (assess.reading?.total || 0) + (assess.character?.total || 0) + (assess.activity?.total || 0) + (assess.competency?.total || 0);
    const dimPct = dimTotal > 0 ? ((dimPass / dimTotal) * 100).toFixed(1) + '%' : '-';
    const dimSubtext = dimTotal > 0 ? `ผ่านเกณฑ์ ${dimPass}/${dimTotal} รายการ` : 'ยังไม่มีข้อมูลประเมิน';

    body.innerHTML = `
      <!-- KPI Top Summary -->
      <div class="row g-3 mb-4">
        <div class="col-6 col-md-3">
          <div class="card p-3 border-0 text-center" style="background:#f0f7ff;border-radius:12px;">
            <div class="text-muted small fw-bold">นักเรียนในระบบ / ประเมิน</div>
            <div class="fs-3 fw-bold text-primary">${totStudents} คน</div>
            <div class="text-muted" style="font-size:0.75rem;">ปีการศึกษา ${year}</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card p-3 border-0 text-center" style="background:#ecfdf5;border-radius:12px;">
            <div class="text-muted small fw-bold">ระดับ 3 ขึ้นไป (ดี-ดีเยี่ยม)</div>
            <div class="fs-3 fw-bold text-success">${overallPct}</div>
            <div class="text-muted" style="font-size:0.75rem;">(เป้าหมายสถานศึกษา ≥ 70%)</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card p-3 border-0 text-center" style="background:#fefce8;border-radius:12px;">
            <div class="text-muted small fw-bold">เกรดเฉลี่ยรวม (GPA)</div>
            <div class="fs-3 fw-bold text-warning">${overallGpa}</div>
            <div class="text-muted" style="font-size:0.75rem;">จาก 8 กลุ่มสาระการเรียนรู้</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card p-3 border-0 text-center" style="background:#faf5ff;border-radius:12px;">
            <div class="text-muted small fw-bold">ประเมินพัฒนาการ 4 ด้าน</div>
            <div class="fs-3 fw-bold text-purple" style="color:#7c3aed;">${dimPct}</div>
            <div class="text-muted" style="font-size:0.75rem;">${dimSubtext}</div>
          </div>
        </div>
      </div>

      <!-- Table 1: 8 Subject Areas -->
      <h6 class="fw-bold text-dark mb-2">
        <i class="bi bi-table me-1 text-primary"></i>ตารางที่ 1: ร้อยละของนักเรียนที่มีผลสัมฤทธิ์ทางการเรียนระดับ 3 ขึ้นไป ประจำปีการศึกษา ${year}
      </h6>
      <div class="table-responsive mb-4">
        <table class="table table-bordered table-hover text-center align-middle small mb-0">
          <thead class="table-light">
            <tr>
              <th rowspan="2" class="text-start">กลุ่มสาระการเรียนรู้</th>
              <th rowspan="2">จำนวนนักเรียน</th>
              <th colspan="8">จำนวนนักเรียนจำแนกตามระดับผลการเรียน</th>
              <th rowspan="2" class="table-success">ได้ระดับ 3 ขึ้นไป</th>
              <th rowspan="2" class="table-success">ร้อยละ</th>
              <th rowspan="2" class="table-primary">เกรดเฉลี่ย</th>
            </tr>
            <tr>
              <th>4</th><th>3.5</th><th>3</th><th>2.5</th><th>2</th><th>1.5</th><th>1</th><th>0</th>
            </tr>
          </thead>
          <tbody>
            ${areas.map(a => {
              const hasData = (a.total || 0) > 0;
              return `
              <tr>
                <td class="text-start fw-bold">${a.name}</td>
                <td>${hasData ? a.total : 0}</td>
                <td>${hasData ? (a.counts?.['4'] || 0) : '-'}</td>
                <td>${hasData ? (a.counts?.['3.5'] || 0) : '-'}</td>
                <td>${hasData ? (a.counts?.['3'] || 0) : '-'}</td>
                <td>${hasData ? (a.counts?.['2.5'] || 0) : '-'}</td>
                <td>${hasData ? (a.counts?.['2'] || 0) : '-'}</td>
                <td>${hasData ? (a.counts?.['1.5'] || 0) : '-'}</td>
                <td>${hasData ? (a.counts?.['1'] || 0) : '-'}</td>
                <td>${hasData ? (a.counts?.['0'] || 0) : '-'}</td>
                <td class="fw-bold ${hasData ? 'text-success' : 'text-muted'}">${hasData ? (a.goodPlus || 0) : '-'}</td>
                <td class="fw-bold ${hasData ? 'text-success' : 'text-muted'}">${hasData ? (a.goodPlusPct || '0.0%') : '-'}</td>
                <td class="fw-bold ${hasData ? 'text-primary' : 'text-muted'}">${hasData ? (a.meanGpa || '0.00') : '-'}</td>
              </tr>
            `;}).join('')}
          </tbody>
          <tfoot class="table-light fw-bold">
            <tr>
              <td class="text-start">รวม / เฉลี่ยทั้งสถานศึกษา</td>
              <td>${evalSum}</td>
              <td colspan="8">-</td>
              <td class="text-success">${evalSum > 0 ? goodSum : '-'}</td>
              <td class="text-success">${overallPct}</td>
              <td class="text-primary">${overallGpa}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Table 2: 4 Dimensions -->
      <h6 class="fw-bold text-dark mb-2">
        <i class="bi bi-person-check me-1 text-primary"></i>ตารางที่ 2: สรุปผลการประเมินพัฒนาการผู้เรียน 4 ด้าน ประจำปีการศึกษา ${year}
      </h6>
      <div class="table-responsive">
        <table class="table table-bordered table-hover text-center align-middle small mb-0">
          <thead class="table-light">
            <tr>
              <th class="text-start">รายการประเมิน</th>
              <th>จำนวนที่ประเมิน</th>
              <th>ดีเยี่ยม (คน)</th>
              <th>ดี (คน)</th>
              <th>ผ่าน (คน)</th>
              <th>ไม่ผ่าน (คน)</th>
              <th class="table-success">ร้อยละผ่านเกณฑ์</th>
            </tr>
          </thead>
          <tbody>
            ${[
              { name: '1. การอ่าน คิดวิเคราะห์ และเขียน', d: assess.reading },
              { name: '2. คุณลักษณะอันพึงประสงค์ 8 ประการ', d: assess.character },
              { name: '3. กิจกรรมพัฒนาผู้เรียน', d: assess.activity, isAct: true },
              { name: '4. สมรรถนะสำคัญของผู้เรียน 5 ด้าน', d: assess.competency }
            ].map(item => {
              const d = item.d || {};
              const tot = Number(d.total || 0);
              const passCount = item.isAct ? Number(d.pass || 0) : (Number(d.excellent || 0) + Number(d.good || 0) + Number(d.pass || 0));
              const pct = tot > 0 ? ((passCount / tot) * 100).toFixed(1) + '%' : '-';
              return `
                <tr>
                  <td class="text-start fw-bold">${item.name}</td>
                  <td>${tot > 0 ? tot : 0}</td>
                  <td>${item.isAct ? '-' : (tot > 0 ? (d.excellent || 0) : '-')}</td>
                  <td>${item.isAct ? '-' : (tot > 0 ? (d.good || 0) : '-')}</td>
                  <td>${tot > 0 ? (d.pass || 0) : '-'}</td>
                  <td>${tot > 0 ? (d.fail || 0) : '-'}</td>
                  <td class="fw-bold ${tot > 0 ? 'text-success' : 'text-muted'}">${pct}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  overlay.querySelector('#sarYearSelect')?.addEventListener('change', (e) => {
    loadSarData(e.target.value);
  });

  overlay.querySelector('#btnExportSarPdf')?.addEventListener('click', () => {
    const yr = overlay.querySelector('#sarYearSelect')?.value || defaultYear;
    const btn = overlay.querySelector('#btnExportSarPdf');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>กำลังสร้าง PDF...';

    if (typeof google !== 'undefined' && google.script?.run) {
      google.script.run
        .withSuccessHandler((url) => {
          btn.disabled = false;
          btn.innerHTML = '<i class="bi bi-printer-fill me-1"></i>ดาวน์โหลดรายงาน SAR (PDF)';
          if (url) {
            const win = window.open(url, '_blank');
            if (!win || win.closed || typeof win.closed === 'undefined') {
              const a = document.createElement('a');
              a.href = url;
              a.target = '_blank';
              a.download = `SAR_Analytics_${yr}.pdf`;
              document.body.appendChild(a);
              a.click();
              a.remove();
            }
          }
        })
        .withFailureHandler((err) => {
          btn.disabled = false;
          btn.innerHTML = '<i class="bi bi-printer-fill me-1"></i>ดาวน์โหลดรายงาน SAR (PDF)';
          alert('สร้าง PDF ไม่สำเร็จ: ' + (err.message || err));
        })
        .exportSarAnalyticsPDF(yr);
    }
  });

  loadSarData(defaultYear);
}

window.showSarAnalyticsModal = showSarAnalyticsModal_;
window.showSarAnalyticsModal_ = showSarAnalyticsModal_;
