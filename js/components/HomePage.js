// js/components/HomePage.js — 首页 Vue 组件
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.HomePageComponent = {
    template: '#home-page-template',
    data: function() {
      return {
        appVersion: window.APP_VERSION || '1.0.0',
        lastCommit: window.APP_LAST_COMMIT || '',
        modules: [
          { page: 'skeleton', icon: '🏗️', name: '筑基', desc: '7 大骨架规则' },
          { page: 'training', icon: '🃏', name: '抽丝', desc: '断句训练' },
          { page: 'stems', icon: '📝', name: '剥茧', desc: '核心词干' },
          { page: 'ai', icon: '🤖', name: '砥砺', desc: 'AI 练句' },
          { page: 'scene', icon: '🎭', name: '临境', desc: '情景对话' },
          { page: 'schedule', icon: '🗓️', name: '润物', desc: '两周日课' },
          { page: 'reference', icon: '🏷️', name: '拾遗', desc: '标签速查' }
        ]
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