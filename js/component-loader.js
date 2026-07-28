// js/component-loader.js — 组件懒加载系统
// 按需加载 Vue 组件 JS，减少首屏加载体积
;(function() {
  'use strict';

  var loaded = {};
  var pending = {};

  // 组件依赖映射：主组件名 -> 依赖的组件名数组
  var componentDeps = {
    'TrainingPage': ['TrainingCard']
  };

  window.loadComponent = function(name) {
    return new Promise(function(resolve, reject) {
      // 已加载
      if (loaded[name]) {
        resolve(window[name + 'Component']);
        return;
      }
      // 加载中，排队
      if (pending[name]) {
        pending[name].push(resolve);
        return;
      }
      pending[name] = [resolve];

      // 先加载依赖
      var deps = componentDeps[name] || [];
      var depPromises = deps.map(function(dep) {
        if (loaded[dep]) return Promise.resolve();
        return window.loadComponent(dep);
      });

      Promise.all(depPromises).then(function() {
        var script = document.createElement('script');
        script.src = 'js/components/' + name + '.js';
        script.onload = function() {
          loaded[name] = true;
          var cbs = pending[name];
          delete pending[name];
          cbs.forEach(function(fn) { fn(window[name + 'Component']); });
          // 注册到 Vue 应用（使用挂载前的 app 实例，mount 后 .component() 不可用）
          if (window.vueAppInstance && window[name + 'Component']) {
            var kebab = name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
            window.vueAppInstance.component(kebab, window[name + 'Component']);
          }
        };
        script.onerror = function() {
          delete pending[name];
          reject(new Error('Failed to load component: ' + name));
        };
        document.body.appendChild(script);
      }).catch(function(err) {
        delete pending[name];
        reject(err);
      });
    });
  };

  // 预加载关键组件（首页 + Design System 已经加载，这里只做标记）
  window.markComponentLoaded = function(name) {
    loaded[name] = true;
  };

  console.log('Component loader ready');
})();