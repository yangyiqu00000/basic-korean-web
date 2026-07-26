;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;
  window.BkProgressBarComponent = {
    template: '#bk-progress-bar-template',
    props: {
      done: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      label: { type: String, default: '' }
    },
    computed: {
      percent: function() {
        if (this.total <= 0) return 0;
        return Math.round((this.done / this.total) * 100);
      }
    }
  };
})();
