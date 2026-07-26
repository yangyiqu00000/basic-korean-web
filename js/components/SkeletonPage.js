// js/components/SkeletonPage.js — 骨架规则页（筑基）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.SkeletonPageComponent = {
    template: '#skeleton-page-template',
    data: function() {
      return {
        rules: window.RULES || [],
        expanded: {}
      };
    },
    methods: {
      toggleRule: function(id) {
        this.expanded[id] = !this.expanded[id];
      },
      expandAll: function() {
        var self = this;
        this.rules.forEach(function(r) { self.expanded[r.id] = true; });
      },
      collapseAll: function() {
        this.expanded = {};
      },
      navigate: function(page) {
        if (window.vueApp && window.vueApp.navigate) {
          window.vueApp.navigate(page);
        } else if (typeof window.navigate === 'function') {
          window.navigate(page);
        }
      },
      speak: function(text) {
        if (typeof window.speakKorean === 'function') {
          window.speakKorean(text);
        }
      }
    }
  };
})();