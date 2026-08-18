<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertTriangle, CheckCircle2, XCircle } from '@lucide/vue'
import type { ValidationResult } from '@shared/types'
import { api } from '../../lib/api'
import { appEntries } from '../../stores/apps'
import { closeDiagnostics, diagnosticsId, openEdit } from '../../stores/ui'
import Modal from '../Modal.vue'

const result = ref<ValidationResult | null>(null)
const app = computed(() => appEntries.value.find((e) => e.id === diagnosticsId.value))

onMounted(async () => {
  if (diagnosticsId.value) result.value = await api.validateApp(diagnosticsId.value)
})

function edit(): void {
  if (app.value) openEdit(app.value)
  closeDiagnostics()
}
</script>

<template>
  <Modal v-if="app" :title="`启动诊断 · ${app.name}`" width="540px" @close="closeDiagnostics">
    <div v-if="result" class="space-y-2">
      <div v-if="result.ok" class="flex items-center gap-2 font-mono text-sm font-medium text-go dark:text-go-soft">
        <CheckCircle2 :size="18" />
        配置有效，可以启动
      </div>
      <div
        v-for="(iss, i) in result.issues"
        :key="i"
        class="rounded-lg border p-3 text-sm"
        :class="
          iss.level === 'error'
            ? 'border-alert/40 bg-alert/8'
            : 'border-warn/40 bg-warn/8'
        "
      >
        <div class="flex items-start gap-2">
          <AlertTriangle v-if="iss.level === 'warning'" :size="15" class="mt-0.5 shrink-0 text-warn dark:text-warn-soft" />
          <XCircle v-else :size="15" class="mt-0.5 shrink-0 text-alert dark:text-alert-soft" />
          <div>
            <div :class="iss.level === 'error' ? 'text-alert dark:text-alert-soft' : 'text-warn dark:text-warn-soft'">{{ iss.message }}</div>
            <div v-if="iss.fix" class="mt-1 font-mono text-xs text-ink-soft dark:text-chalk-soft">修复建议：{{ iss.fix }}</div>
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 pt-3">
        <button class="btn-ghost" @click="closeDiagnostics">关闭</button>
        <button class="btn-primary" @click="edit">打开编辑</button>
      </div>
    </div>
  </Modal>
</template>
