/**
 * Application Bootstrap & Entry Point (`lasius-dashboard/src/main.ts`).
 *
 * Purpose & Role:
 *   Initializes the Vue 3 Single-Page Application, registers the Pinia state
 *   management store (`useDashboardStore`), imports the global design-system
 *   stylesheet, and mounts the root `App.vue` component into `#app`.
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/style.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.mount('#app');
