// js/components/StemsPage.js — stems-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.StemsPageComponent = {
    template: '<div class="stems-page-vue"></div>',
    mounted: function() {
      var fn = window['renderStemsPage'];
      if (typeof fn === 'function') {
        this.$el.innerHTML = fn();
      }
    }
  };
})();
