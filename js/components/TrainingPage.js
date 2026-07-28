// js/components/TrainingPage.js — training-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.TrainingPageComponent = {
    template: '<div class="training-page-vue"></div>',
    mounted: function() {
      var fn = window['renderTrainingPage'];
      if (typeof fn === 'function') {
        this.$el.innerHTML = fn();
      }
    }
  };
})();
