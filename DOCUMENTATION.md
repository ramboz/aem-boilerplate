Welcome to the franklin-plugins-boilerplate documentation!

This project is a fork of [@adobe/helix-project-boilerplate](https://github.com/adobe/helix-project-boilerplate) with the addition of a plugin system, and extraction of some of the core logic as plugins.

## Plugins system

### Why?
In its current state, the official Franklin boilerplate has a few shortcomings regarding long-term maintainability:
- it is easy for project teams to break the loading sequence in `scripts.js`, and you hence lose the benefits of the 3 phases
- it is hard to distinguish project code from core boilerplate logic, and to merge back improvements without conflicts
- centralizing the logic in 2 main files, `lib-franklin.js` and `scripts.js`, quickly grows out of proportion on serious projects, and the increase in size essentially impacts the LCP negatively
- code isn't easily testable, so it's easy to introduce regressions without knowing

### Driving principles
The plugin system tries to improve on the above by offering:
- Protection of the loading sequence (Eager, Lazy & Delayed phases)
- Separation of concerns in `lib-franklin.js` and `scripts.js`
- Increased code testability and maintainability
- a PSI/LH score that sits at 100 by default
- easy "hooks" for plugins to inject key logic in the right places in the loading sequence
- controlled execution context with core helper methods exposed to avoid cyclic dependencies and imports

### Loading a plugin
Plugins can be loaded via the `withPlugin` method in `lib-franklin.js`:
```js
import { init, withPlugin } from './lib-franklin.js';

...

const options = { ... };
const pluginApi = await withPlugin('/plugins/myPlugin/index.js', options);
// pluginApi.foo()

async function loadEager(doc, options) {
  // this.context.myPlugin.foo()
}

init({
  loadEager,
});
```

The `options` object accepts an optional `condition` method to only activate the plugin if some criteria are met:
```js
import { init, getMetadata, withPlugin } from './lib-franklin.js';

await withPlugin('/plugins/myPlugin/index.js', {
  condition: () => getMetadata('foo') === 'bar
});

async function loadEager(doc, options) {
  // this.context.myPlugin will only be available if the `foo` meta element had the right value
}

init({
  loadEager,
});
```

Note that core plugins are automatically loaded by default, so you don't have to explicitly load them again.

### Execution context
Plugin methods are all executed with a custom context that provides access to core helper methods and plugins on the `this` object.

```js
// defining some logic running before the Eager phase
export async function init(document, options) {
  // this.getMetadata('foo')
  // this.loadCSS('/styles.css', cb)
  // this.readBlockConfig(block)
  // this.toCamelCase(str)
  // this.toClassName(str)
  // this.plugins
}
```

### Hooks
The plugin system will automatically recognize exported methods that match one of the hooks and trigger it at the right time:
|Event|script.js methods|plugin hooks|
|-|-|-|
|Initialization| - | `init` or `default` |
|Start of eager phase| - | `preEager` |
|Eager phase| `loadEager` | - |
|End of eager phase| - | `postEager` |
|Start of lazy phase| - | `preLazy` |
|Lazy phase| `loadLazy` | `patchBlockConfig` |
|End of lazy phase| - | `postLazy` |
|Configurable timeout| `delayedDuration` … 3s | |
|Start of delayed phase| - | `preDelayed` |
|Delayed phase| `loadDelayed` | - |
|End of delayed phase| - | `postDelayed` |


```js
// defining some logic running before the Eager phase
export async function preEager(document, options) {
  // options.myOption: accessing an option defined when loading the plugin
  // this.plugins.myPlugin.myMethod(…): accessing a public method from another plugin via the execution context
}
```

### API

Plugins can also expose a public API so you can directly access them in `scripts.js` or in other plugins that depend on them.

```js
// this isn't publicly exposed and only available to direct importers
export function aMethodNotExposedInTheApi(…) { … }

// this is publicly exposed in the execution context
export const api = {
  aMethodExposedInTheApi: (…) => { … }
}
```

### Minimal example
Here is a minimal example of a `scripts.js` file containing an inline plugin to showcase the loading sequence:
```js
import {
  init,
  withPlugin,
} from './lib-franklin.js';

console.log('project init');

await withPlugin(() => {
  console.log('plugin init');
  return {
    name: 'foo',
    api: {
      hello: (user = 'world') => `Hello ${user}!`
    },
    preEager: function() {
      console.log('preEager');
    },
    postEager: function() {
      console.log('postEager');
    },
    preLazy: function() {
      console.log('preLazy');
    },
    postLazy: function() {
      console.log('postLazy');
    },
    preDelayed: function(doc, options) {
      console.log('preDelayed', `after ${options.delayedDuration}ms`);
    },
    postDelayed: function() {
      console.log('postDelayed');
    }
  };
}, {});

/**
 * loads everything needed to get to LCP.
 */
async function loadEager() {
  console.log('eager', this.plugins.foo.hello('bar'));
}

/**
 * loads everything that doesn't need to be delayed.
 */
async function loadLazy() {
  console.log('lazy');
}

/**
 * loads everything that happens a lot later, without impacting
 * the user experience.
 */
function loadDelayed() {
  console.log('delayed');
}

init({
  loadEager,
  loadLazy,
  loadDelayed,
  delayedDuration: 1337,
});

```
This would output:  
<img width="186" alt="Screenshot 2023-01-02 at 11 29 04 AM" src="https://user-images.githubusercontent.com/1235810/210219511-fef2971a-f4cf-4a59-95cb-55fb7fc84e48.png">


## Core plugins

|Name|Description|
|-|-|
|Real User Monitoring|A plugin that collects RUM data using the Franklin infrastructure
|Decorator|A plugin that offers the most common decoration logic for sections, blocks, buttons, icons, etc.
|Normalizer|A plugin that normalizes and sanitizes the HTML markup
|[Placeholders](https://www.hlx.live/docs/placeholders)|A plugin that fetches placeholder values in the lazy phase
|Preview|A plugin that provides a minimal UI library to create overlays for dev/preview

## Others

|Name|Description|
|-|-|
|[Experimentation](https://github.com/ramboz/franklin-plugin-experimentation)|A plugin to run A/B test scenarios
|Heatmap|A plugin to overlay a heatmap over the page with relevant metrics
|[PerfLogger](https://github.com/ramboz/franklin-plugin-perflogger)|A plugin that outputs key performance metrics to the console (page load, CWV, etc.)
|[Screens](https://github.com/ramboz/franklin-plugin-screens)|A plugin to support digital signage scenarios for AEM Screens
