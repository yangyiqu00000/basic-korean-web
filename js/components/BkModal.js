;(function() {
  'use strict';
  if (typeof Vue === 'undefined') return;
  window.BkModalComponent = {
    template: '#bk-modal-template',
    props: {
      visible: { type: Boolean, default: false },
      title: { type: String, default: '' }
    },
    methods: {
      close: function() { this.$emit('close'); },
      onClickOverlay: function(e) { if (e.target === e.currentTarget) this.close(); }
    }
  };
})();