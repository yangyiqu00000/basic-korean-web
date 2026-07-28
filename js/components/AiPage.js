// js/components/AiPage.js — ai-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.AiPageComponent = {
    template: '<div class="ai-page-vue"></div>',
    mounted: function() {
      var fn = window['renderAiPage'];
      if (typeof fn === 'function') {
        this.$el.innerHTML = fn();
      }
    }
  };
})();
