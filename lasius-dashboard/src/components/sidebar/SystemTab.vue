<script setup lang="ts">
import { computed } from 'vue';
import { useDashboardStore } from '../../stores/dashboardStore';

const store = useDashboardStore();
const stats = computed(() => store.systemStats);

// Thermal badge & temp
const tempC = computed(() => stats.value?.thermal?.temp_c ?? 0);
const tempBadgeClass = computed(() => {
  if (tempC.value >= 75) return 'kpi-badge kpi-badge-alert';
  if (tempC.value >= 60) return 'kpi-badge kpi-badge-warn';
  return 'kpi-badge kpi-badge-ok';
});

// CPU utilization & bar
const cpuPercent = computed(() => stats.value?.cpu?.percent ?? 0);
const cpuBarClass = computed(() => {
  if (cpuPercent.value > 80) return 'metric-bar-fill fill-red';
  if (cpuPercent.value > 50) return 'metric-bar-fill fill-amber';
  return 'metric-bar-fill fill-green';
});

// Load average
const loadAvgStr = computed(() => {
  if (!stats.value?.cpu) return '-- · -- · --';
  return `${stats.value.cpu.load_1m.toFixed(2)} · ${stats.value.cpu.load_5m.toFixed(2)} · ${stats.value.cpu.load_15m.toFixed(2)}`;
});

// Memory
const memUsedMb = computed(() => Math.round(stats.value?.memory?.used_mb ?? 0));
const memTotalMb = computed(() => Math.round(stats.value?.memory?.total_mb ?? 0));
const memPercent = computed(() => stats.value?.memory?.percent ?? 0);
const memAvailMb = computed(() => Math.round(stats.value?.memory?.available_mb ?? 0));
const memBarClass = computed(() => {
  if (memPercent.value > 85) return 'metric-bar-fill fill-red';
  if (memPercent.value > 70) return 'metric-bar-fill fill-amber';
  return 'metric-bar-fill fill-blue';
});

// Daemon RSS & Uptime
const daemonRssMb = computed(() => stats.value?.daemon?.daemon_rss_mb?.toFixed(1) ?? '--');
const uptimeFormatted = computed(() => stats.value?.daemon?.uptime_formatted ?? '--');

// Power
const isUnderVoltage = computed(() => Boolean(stats.value?.power?.under_voltage_active));
const isThrottled = computed(() => Boolean(stats.value?.power?.throttled_active));
const throttledRaw = computed(() => stats.value?.power?.throttled_raw ?? '0x0');

const powerCardClass = computed(() => {
  if (isUnderVoltage.value || isThrottled.value) return 'power-status-card alert';
  return 'power-status-card';
});

const powerBadgeClass = computed(() => {
  if (isUnderVoltage.value) return 'kpi-badge kpi-badge-alert';
  if (isThrottled.value) return 'kpi-badge kpi-badge-warn';
  return 'kpi-badge kpi-badge-ok';
});

const powerBadgeText = computed(() => {
  if (isUnderVoltage.value) return 'Under-Voltage';
  if (isThrottled.value) return 'Throttling';
  return 'Healthy';
});

const powerTitle = computed(() => {
  if (isUnderVoltage.value) return 'Under-Voltage Detected!';
  if (isThrottled.value) return 'Thermal Throttling Active!';
  return '5V Power Rail Stable';
});

const powerDesc = computed(() => {
  if (isUnderVoltage.value) return 'Power rail dipped below 4.63V. Check battery/cabling!';
  if (isThrottled.value) return 'SoC frequency reduced due to high temperature.';
  return 'No undervoltage or frequency capping detected.';
});

const voltageStatusText = computed(() => {
  if (isUnderVoltage.value) return 'ACTIVE';
  if (isThrottled.value) return 'Throttled';
  return 'Normal';
});

const voltageStatusClass = computed(() => {
  if (isUnderVoltage.value) return 'kpi-subval text-red';
  if (isThrottled.value) return 'kpi-subval text-amber';
  return 'kpi-subval text-green';
});

// Network
const wifiIfname = computed(() => stats.value?.wifi?.interface ?? 'wlan0');
const wifiDbm = computed(() => stats.value?.wifi?.signal_dbm ?? '--');
const wifiPct = computed(() => stats.value?.wifi?.quality_percent ?? 0);
const wifiBadgeText = computed(() => (stats.value?.wifi?.connected ? 'Online' : 'Offline'));
const wifiBadgeClass = computed(() => (stats.value?.wifi?.connected ? 'kpi-badge kpi-badge-ok' : 'kpi-badge kpi-badge-alert'));

// Disk
const diskUsedGb = computed(() => stats.value?.disk?.used_gb?.toFixed(1) ?? '--');
const diskTotalGb = computed(() => stats.value?.disk?.total_gb?.toFixed(1) ?? '--');
</script>

<template>
  <aside class="control-panel-2col">
    <!-- Left Column: CPU, Memory, SoC Thermal -->
    <div class="panel-col">
      <!-- SoC Thermal & CPU Core Section -->
      <div class="control-section">
        <div class="section-header-flex">
          <h2>Processor &amp; Thermal</h2>
          <span id="sys-thermal-badge" :class="tempBadgeClass">{{ tempC ? `${tempC.toFixed(1)} °C` : '-- °C' }}</span>
        </div>
        <div class="kpi-metric-row">
          <div class="kpi-metric-label">
            <span>CPU Utilization</span>
            <span id="sys-cpu-val" class="kpi-metric-val">{{ cpuPercent ? `${cpuPercent.toFixed(1)}%` : '--%' }}</span>
          </div>
          <div class="metric-bar-track">
            <div id="sys-cpu-bar" :class="cpuBarClass" :style="{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }"></div>
          </div>
        </div>
        <div class="kpi-subgrid" style="margin-top: 10px;">
          <div class="kpi-subitem">
            <span class="kpi-sublabel">Load Avg (1 / 5 / 15m)</span>
            <span id="sys-loadavg-val" class="kpi-subval">{{ loadAvgStr }}</span>
          </div>
          <div class="kpi-subitem">
            <span class="kpi-sublabel">SoC Temp (°C)</span>
            <span id="sys-temp-val" class="kpi-subval">{{ tempC ? `${tempC.toFixed(1)} °C` : '-- °C' }}</span>
          </div>
        </div>
      </div>

      <!-- RAM Memory Section -->
      <div class="control-section">
        <div class="section-header-flex">
          <h2>Memory (RAM)</h2>
          <span id="sys-ram-badge" class="kpi-badge kpi-badge-neutral">{{ memPercent ? `${memPercent.toFixed(1)}%` : '--%' }}</span>
        </div>
        <div class="kpi-metric-row">
          <div class="kpi-metric-label">
            <span>RAM Used</span>
            <span id="sys-ram-val" class="kpi-metric-val">{{ memTotalMb ? `${memUsedMb} / ${memTotalMb} MB` : '-- / -- MB' }}</span>
          </div>
          <div class="metric-bar-track">
            <div id="sys-ram-bar" :class="memBarClass" :style="{ width: `${Math.min(100, Math.max(0, memPercent))}%` }"></div>
          </div>
        </div>
        <div class="kpi-subgrid" style="margin-top: 10px;">
          <div class="kpi-subitem">
            <span class="kpi-sublabel">Available RAM</span>
            <span id="sys-ram-avail-val" class="kpi-subval">{{ memAvailMb ? `${memAvailMb} MB` : '-- MB' }}</span>
          </div>
          <div class="kpi-subitem">
            <span class="kpi-sublabel">Lasius Daemon RSS</span>
            <span id="sys-daemon-rss-val" class="kpi-subval">{{ daemonRssMb !== '--' ? `${daemonRssMb} MB` : '-- MB' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column: Power Health, Wi-Fi, Storage & Uptime -->
    <div class="panel-col">
      <!-- Power & Throttling Health -->
      <div class="control-section">
        <div class="section-header-flex">
          <h2>Power &amp; Voltage Health</h2>
          <span id="sys-power-badge" :class="powerBadgeClass">{{ powerBadgeText }}</span>
        </div>
        <p class="section-desc">Hardware brownout &amp; undervoltage detection (vcgencmd throttled status).</p>
        <div :class="powerCardClass" id="sys-power-card">
          <div class="power-status-icon" id="sys-power-icon"></div>
          <div class="power-status-details">
            <div class="power-status-title" id="sys-power-title">{{ powerTitle }}</div>
            <div class="power-status-desc" id="sys-power-desc">{{ powerDesc }}</div>
          </div>
        </div>
        <div class="kpi-subgrid" style="margin-top: 8px;">
          <div class="kpi-subitem">
            <span class="kpi-sublabel">Raw Throttled Flag</span>
            <span id="sys-throttled-hex" class="kpi-subval mono">{{ throttledRaw }}</span>
          </div>
          <div class="kpi-subitem">
            <span class="kpi-sublabel">Voltage Status</span>
            <span id="sys-undervoltage-val" :class="voltageStatusClass">{{ voltageStatusText }}</span>
          </div>
        </div>
      </div>

      <!-- Connectivity & System Storage -->
      <div class="control-section" style="border-bottom:none; padding-bottom:0;">
        <div class="section-header-flex">
          <h2>Network &amp; Storage</h2>
          <span id="sys-wifi-badge" :class="wifiBadgeClass">{{ wifiBadgeText }}</span>
        </div>
        <div class="kpi-metric-row">
          <div class="kpi-metric-label">
            <span>Wi-Fi Signal (<span id="sys-wifi-ifname">{{ wifiIfname }}</span>)</span>
            <span id="sys-wifi-val" class="kpi-metric-val">{{ wifiDbm !== '--' ? `${wifiDbm} dBm` : '-- dBm' }}</span>
          </div>
          <div class="metric-bar-track">
            <div id="sys-wifi-bar" class="metric-bar-fill fill-green" :style="{ width: `${Math.min(100, Math.max(0, wifiPct))}%` }"></div>
          </div>
        </div>
        <div class="kpi-subgrid" style="margin-top: 10px;">
          <div class="kpi-subitem">
            <span class="kpi-sublabel">Root Storage Disk</span>
            <span id="sys-disk-val" class="kpi-subval">{{ diskTotalGb !== '--' ? `${diskUsedGb} / ${diskTotalGb} GB` : '-- GB' }}</span>
          </div>
          <div class="kpi-subitem">
            <span class="kpi-sublabel">Pi System Uptime</span>
            <span id="sys-uptime-val" class="kpi-subval">{{ uptimeFormatted }}</span>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
