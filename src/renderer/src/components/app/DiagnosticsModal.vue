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
      <div v-if="result.ok" class="flex items-center gap-2 text-sm text-emerald-600">
        <CheckCircle2 :size="18" />
        配置有效，可以启动
      </div>
      <div
        v-for="(iss, i) in result.issues"
        :key="i"
        class="rounded-lg border p-3 text-sm"
        :class="
          iss.level === 'error'
            ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'
            : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
        "
      >
        <div class="flex items-start gap-2">
          <AlertTriangle v-if="iss.level === 'warning'" :size="15" class="mt-0.5 shrink-0 text-amber-500" />
          <XCircle v-else :size="15" class="mt-0.5 shrink-0 text-red-500" />
          <div>
            <div :class="iss.level === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300'">{{ iss.message }}</div>
            <div v-if="iss.fix" class="mt-1 text-xs text-neutral-500">修复建议：{{ iss.fix }}</div>
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
