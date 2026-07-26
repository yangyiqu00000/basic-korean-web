// js/components/HomePage.js — 首页 Vue 组件
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.HomePageComponent = {
    template: '#home-page-template',
    data: function() {
      return {
        appVersion: window.APP_VERSION || '1.0.0',
        lastCommit: window.APP_LAST_COMMIT || ''
      };
    },
    methods: {
      go: function(page) {
        if (window.vueApp && window.vueApp.navigate) {
          window.vueApp.navigate(page);
        } else if (typeof window.navigate === 'function') {
          window.navigate(page);
        }
      },
      openStats: function() {
        if (typeof window.openStats === 'function') {
          window.openStats();
        }
      }
    }
  };
})();