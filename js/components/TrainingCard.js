// js/components/TrainingCard.js — 断句训练卡片
;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;

  window.TrainingCardComponent = {
    template: '#training-card-template',
    props: {
      sentence: { type: Object, required: true },
      done: { type: Boolean, default: false },
      index: { type: Number, default: 0 }
    },
    data: function() {
      return { isRevealed: false };
    },
    methods: {
      toggleReveal: function() { this.isRevealed = !this.isRevealed; },
      toggleDone: function() {
        this.$emit('toggle-done', this.sentence.id);
      },
      speak: function() {
        if (typeof window.speakKorean === 'function') {
          window.speakKorean(this.sentence.kr);
        }
      },
      getElemClass: function(tag) {
        if (typeof window.getElemClass === 'function') {
          return window.getElemClass({ tag: tag });
        }
        return 'elem-' + (tag === '词干' ? 'stem' : tag === '助词' ? 'particle' : tag === '词尾' ? 'ending-terminal' : '');
      }
    }
  };
})();