const BLOG_THEME_SELECTOR = ".nfixed-back,-webkit-scrollbar-track,.moon,.sun-blue,.sun-black,.cat-btn-box a,.back-btn a,.content-box-blur,.main-inner,.hello-p,.bold,.high,.more-box-p,.main-inner h1,.arrow-right,body,h1,h2,.recent-text h3,.logo,.scerch-btn,.main-inner h2,.header-logo,.main-inner p,.main-inner li,p,.main-inner ul,.main-cont-back,.footer,.back-btn img,.line,.hello-content-box p,.header";

function applyThemeClass(action) {
  const sections = document.querySelectorAll(BLOG_THEME_SELECTOR);
  sections.forEach((item) => {
    item.classList[action]("dark");
  });
}

function dark() {
  applyThemeClass("remove");
}

function light() {
  applyThemeClass("add");
}

function toggle() {
  applyThemeClass("toggle");
}