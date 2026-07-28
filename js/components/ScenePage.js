// js/components/ScenePage.js — scene-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.ScenePageComponent = {
    template: '<div class="scene-page-vue"></div>',
    mounted: function() {
      var fn = window['renderScenePage'];
      if (typeof fn === 'function') {
        this.$el.innerHTML = fn();
      }
    }
  };
})();
