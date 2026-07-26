// js/vue-app.js — Vue 3 渐进式迁移入口
// 不破坏现有 app.js 全局函数，逐步接管组件渲染

;(function() {
  'use strict';

  if (typeof Vue === 'undefined') {
    console.warn('Vue 3 not loaded, falling back to vanilla JS');
    return;
  }

  var app = Vue.createApp({
    data: function() {
      return {
        currentPage: 'home',
        isMobileMenuOpen: false,
        isDarkTheme: document.documentElement.getAttribute('data-theme') === 'dark'
      };
    },
    methods: {
      navigate: function(page) {
        this.currentPage = page;
        this.isMobileMenuOpen = false;
        if (typeof window.navigate === 'function') {
          window.navigate(page);
        }
      },
      toggleTheme: function() {
        if (typeof window.toggleTheme === 'function') {
          window.toggleTheme();
        }
        this.isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
      },
      toggleMobileMenu: function() {
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
        if (typeof window.toggleMobileMenu === 'function') {
          window.toggleMobileMenu();
        }
      },
      openStats: function() {
        if (typeof window.openStats === 'function') {
          window.openStats();
        }
      }
    }
  });

  // 注册组件（后续逐步添加）
  var componentMap = {
    'home-page': window.HomePageComponent,
    'stats-panel': window.StatsPanelComponent,
    'bk-button': window.BkButtonComponent,
    'bk-card': window.BkCardComponent,
    'bk-badge': window.BkBadgeComponent,
    'bk-modal': window.BkModalComponent,
    'training-card': window.TrainingCardComponent,
    'training-page': window.TrainingPageComponent
  };
  Object.keys(componentMap).forEach(function(name) {
    if (componentMap[name]) {
      app.component(name, componentMap[name]);
    }
  });

  window.vueApp = app.mount('#app');
  console.log('Vue 3 app mounted');
})();