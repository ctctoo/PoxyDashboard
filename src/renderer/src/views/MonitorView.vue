<script setup lang="ts">
import { snapshot, alerts, hiddenPorts, cpuHistory, memHistory, pendingAlertCount } from '../stores/monitor'
import OverviewCards from '../components/monitor/OverviewCards.vue'
import PortAlerts from '../components/monitor/PortAlerts.vue'
import ServiceTable from '../components/monitor/ServiceTable.vue'
import FocusPanel from '../components/monitor/FocusPanel.vue'
import BackgroundPanel from '../components/monitor/BackgroundPanel.vue'
import HiddenPanel from '../components/monitor/HiddenPanel.vue'
</script>

<template>
  <div class="scroll-slim h-full space-y-4 overflow-auto pb-4 pr-1">
    <OverviewCards :snapshot="snapshot" :cpu="cpuHistory" :mem="memHistory" :alert-count="pendingAlertCount" />
    <PortAlerts :alerts="alerts" />
    <ServiceTable :services="snapshot?.services ?? []" />
    <FocusPanel />
    <HiddenPanel :entries="hiddenPorts" />
    <BackgroundPanel :processes="snapshot?.background ?? []" />
  </div>
</template>
