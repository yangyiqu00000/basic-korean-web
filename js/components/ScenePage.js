// js/components/ScenePage.js — scene-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.ScenePageComponent = {
    template: '<div class="scene-page-vue" v-html="pageHtml"></div>',
    computed: {
      pageHtml: function() {
        if (typeof window.renderScene !== 'function') return '';
        if (window.sceneChatState && window.sceneChatState.active) {
          if (typeof window.renderSceneChat === 'function') return window.renderSceneChat();
          return '';
        }
        return window.renderScene();
      }
    }
  };
})();
