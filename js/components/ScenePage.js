// js/components/ScenePage.js — 情景对话页（临境）
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.ScenePageComponent = {
    template: '#scene-page-template',
    data: function() {
      return {
        defaultScenes: ['餐厅点餐', '问路', '购物', '自我介绍', '咖啡厅', '打电话', '旅游', '看病'],
        customScenes: JSON.parse(localStorage.getItem('korean_custom_scenes') || '[]'),
        history: JSON.parse(localStorage.getItem('korean_scene_history') || '[]'),
        // 聊天状态
        mode: 'select', // 'select' | 'chat' | 'review'
        selectedScene: '',
        messages: [],
        input: '',
        loading: false,
        reviewItem: null
      };
    },
    computed: {
      allScenes: function() {
        return this.defaultScenes.concat(this.customScenes);
      }
    },
    methods: {
      startScene: function(scene) {
        this.selectedScene = scene;
        this.messages = [];
        this.mode = 'chat';
        this.loading = true;
        var self = this;
        // 添加助手初始消息占位
        this.messages.push({ role: 'assistant', content: '⏳ 正在准备场景...' });

        if (typeof window.callAIChat === 'function') {
          window.callAIChat(scene, [], function(data) {
            self.loading = false;
            if (data.error) {
              self.messages = [{ role: 'assistant', content: '⚠️ ' + data.error }];
              return;
            }
            self.messages = [{ role: 'assistant', content: data.reply || data.content || '场景已准备好' }];
          });
        } else {
          this.loading = false;
          this.messages = [{ role: 'assistant', content: '⚠️ AI 服务未配置，无法启动情景对话' }];
        }
      },
      sendMessage: function() {
        var text = this.input.trim();
        if (!text || this.loading) return;
        this.input = '';

        var self = this;
        this.messages.push({ role: 'user', content: text });
        this.loading = true;

        if (typeof window.callAIChat === 'function') {
          window.callAIChat(this.selectedScene, this.messages, function(data) {
            self.loading = false;
            if (data.error) {
              self.messages.push({ role: 'assistant', content: '⚠️ ' + data.error });
              return;
            }
            self.messages.push({ role: 'assistant', content: data.reply || data.content || '' });
          });
        } else {
          this.loading = false;
          this.messages.push({ role: 'assistant', content: '⚠️ AI 服务不可用' });
        }
      },
      backToSelect: function() {
        // 保存对话到历史
        if (this.messages.length > 1) {
          this.history.unshift({
            scene: this.selectedScene,
            messages: this.messages.slice(),
            time: new Date().toISOString()
          });
          localStorage.setItem('korean_scene_history', JSON.stringify(this.history));
        }
        this.mode = 'select';
        this.messages = [];
        this.selectedScene = '';
      },
      viewReview: function(item) {
        this.reviewItem = item;
        this.mode = 'review';
      },
      deleteHistory: function(idx) {
        if (confirm('确认删除此对话历史？')) {
          this.history.splice(idx, 1);
          localStorage.setItem('korean_scene_history', JSON.stringify(this.history));
        }
      },
      clearHistory: function() {
        if (confirm('确认清除所有情景对话历史？')) {
          this.history = [];
          localStorage.removeItem('korean_scene_history');
        }
      },
      deleteCustomScene: function(idx) {
        if (confirm('确认删除自定义场景「' + this.customScenes[idx] + '」？')) {
          this.customScenes.splice(idx, 1);
          localStorage.setItem('korean_custom_scenes', JSON.stringify(this.customScenes));
        }
      },
      addCustomScene: function() {
        var name = prompt('请输入新场景名称（如：机场、酒店）：');
        if (name && name.trim()) {
          this.customScenes.push(name.trim());
          localStorage.setItem('korean_custom_scenes', JSON.stringify(this.customScenes));
        }
      },
      speak: function(text) {
        if (typeof window.speakKorean === 'function') {
          window.speakKorean(text);
        }
      },
      escapeHtml: function(text) {
        if (typeof window.escapeHtml === 'function') {
          return window.escapeHtml(text);
        }
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(text || ''));
        return div.innerHTML;
      }
    }
  };
})();