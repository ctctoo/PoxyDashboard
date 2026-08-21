<script setup lang="ts">
import {
  snapshot,
  monitorReady,
  alerts,
  hiddenPorts,
  cpuHistory,
  memHistory,
  pendingAlertCount
} from '../stores/monitor'
import OverviewCards from '../components/monitor/OverviewCards.vue'
import PortAlerts from '../components/monitor/PortAlerts.vue'
import ServiceTable from '../components/monitor/ServiceTable.vue'
import FocusPanel from '../components/monitor/FocusPanel.vue'
import BackgroundPanel from '../components/monitor/BackgroundPanel.vue'
import HiddenPanel from '../components/monitor/HiddenPanel.vue'
import ViewLoading from '../components/ViewLoading.vue'
</script>

<template>
  <div class="h-full">
    <ViewLoading v-if="!monitorReady" label="正在扫描本机服务与端口…" :cards="4" />
    <div v-else class="scroll-slim h-full space-y-4 overflow-auto pb-4 pr-1">
      <OverviewCards
        :snapshot="snapshot"
        :cpu="cpuHistory"
        :mem="memHistory"
        :alert-count="pendingAlertCount"
      />
      <PortAlerts :alerts="alerts" />
      <ServiceTable :services="snapshot?.services ?? []" />
      <FocusPanel />
      <HiddenPanel :entries="hiddenPorts" />
      <BackgroundPanel :processes="snapshot?.background ?? []" />
    </div>
  </div>
</template>
