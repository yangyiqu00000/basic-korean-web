// js/components/HomePage.js — 首页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.HomePageComponent = {
    template: '<div class="home-page-vue"></div>',
    mounted: function() {
      if (typeof window.renderHome === 'function') {
        this.$el.innerHTML = window.renderHome();
      }
    }
  };
})();
