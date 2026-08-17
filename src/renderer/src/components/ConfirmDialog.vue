<script setup lang="ts">
import Modal from './Modal.vue'
import { resolveConfirm, useConfirmState } from '../stores/confirm'

const { pending } = useConfirmState()
</script>

<template>
  <Modal v-if="pending" :title="pending.title" width="420px" @close="resolveConfirm(false)">
    <p class="whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-300">{{ pending.body }}</p>
    <div class="mt-5 flex justify-end gap-2">
      <button class="btn-ghost" @click="resolveConfirm(false)">{{ pending.cancelText ?? '取消' }}</button>
      <button :class="pending.danger ? 'btn-danger' : 'btn-primary'" @click="resolveConfirm(true)">
        {{ pending.confirmText ?? (pending.danger ? '确认' : '确定') }}
      </button>
    </div>
  </Modal>
</template>
