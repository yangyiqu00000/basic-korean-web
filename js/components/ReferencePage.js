// js/components/ReferencePage.js — reference-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.ReferencePageComponent = {
    template: '<div class="reference-page-vue"></div>',
    mounted: function() {
      var fn = window['renderReferencePage'];
      if (typeof fn === 'function') {
        this.$el.innerHTML = fn();
      }
    }
  };
})();
