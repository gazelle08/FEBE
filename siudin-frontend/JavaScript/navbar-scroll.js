class ScrollNavbar {
  constructor() {
    this.navbar = document.querySelector('.nav-container');
    this.mainContent = document.querySelector('.main-content');
    this.lastScroll = 0;
    this.scrollThreshold = 100;
    this.navbarHeight = this.navbar.offsetHeight;
    
    this.init();
  }
  
  init() {
    window.addEventListener('scroll', this.handleScroll.bind(this));
    window.addEventListener('resize', this.handleResize.bind(this));
  }
  
  handleScroll() {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll <= 0) {
      this.showNavbar();
      return;
    }
    
    if (currentScroll > this.lastScroll && currentScroll > this.scrollThreshold) {
      this.hideNavbar();
    } else if (currentScroll < this.lastScroll) {
      this.showNavbar();
    }
    
    this.lastScroll = currentScroll;
  }
  
  hideNavbar() {
    this.navbar.setAttribute('data-scroll-state', 'hidden');
    this.mainContent.setAttribute('data-nav-state', 'hidden');
  }
  
  showNavbar() {
    this.navbar.removeAttribute('data-scroll-state');
    this.mainContent.removeAttribute('data-nav-state');
  }
  
  handleResize() {
    this.navbarHeight = this.navbar.offsetHeight;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ScrollNavbar();
});