// js/components/ScenePage.js — scene-page页（Vue 容器 + 原始渲染）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.ScenePageComponent = {
    template: '<div class="scene-page-vue" v-html="pageHtml"></div>',
    computed: {
      pageHtml: function() {
        if (typeof window.renderScene !== 'function') return '';
        var st = window.sceneChatState;
        // 仅当路由是 sceneChat（对话/复习页）时才渲染聊天或复习内容；
        // 路由是 scene（列表页）时一律渲染场景列表 —— 避免离开复习页/对话页后
        // reviewing/active 标志未复位，导致导航回来仍显示复习页/对话页的错位。
        var inChatRoute = !!(window.vueApp && window.vueApp.currentPage === 'sceneChat');
        if (inChatRoute && st && st.reviewing) {
          if (typeof window.renderSceneReview === 'function') return window.renderSceneReview();
          return '';
        }
        if (inChatRoute && st && st.active) {
          if (typeof window.renderSceneChat === 'function') return window.renderSceneChat();
          return '';
        }
        return window.renderScene();
      }
    }
  };
})();
