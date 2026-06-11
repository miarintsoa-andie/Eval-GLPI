<template>
  <div class="settings-page">
    <div class="page-header">
      <h1>Paramètres Kanban</h1>
    </div>

    <div class="panel">
      <p>Personnalisez les 3 colonnes du Kanban : couleur de fond et nom (ex: malgache).</p>

      <div class="row" v-for="s in [1, 2, 6]" :key="s">
        <label>Statut {{ s }} — Nom</label>
        <input v-model="labels[s]" placeholder="Libellé (ex: vaovao)" />
        <label>Couleur</label>
        <input type="color" v-model="colors[s]" />
      </div>

      <div class="actions">
        <button class="btn-primary" @click="save" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer dans SQLite' }}</button>
        <button class="btn-secondary" @click="resetDefaults">Réinitialiser</button>
      </div>

      <div v-if="msg" class="msg">{{ msg }}</div>
      <div v-if="error" class="error">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { preferences, logs } from '../services/springApi.js'

const labels = reactive({ 1: 'Nouveau', 2: 'En cours', 6: 'Clos' })
const colors = reactive({ 1: '#ffffff', 2: '#f0f8ff', 6: '#ffffff' })
const saving = ref(false)
const msg = ref('')
const error = ref('')

async function load() {
  try {
    const pref = await preferences.get('kanban.settings')
    if (pref && pref.value) {
      let val = null
      try { val = JSON.parse(pref.value) } catch (e) { val = null }
      if (val) {
        Object.assign(labels, val.labels || {})
        Object.assign(colors, val.colors || {})
      }
    }
  } catch (e) {
    // not found or other error — silently ignore (defaults stay)
  }
}

function resetDefaults() {
  labels[1] = 'Nouveau'; labels[2] = 'En cours'; labels[6] = 'Clos'
  colors[1] = '#ffffff'; colors[2] = '#f0f8ff'; colors[6] = '#ffffff'
}

async function save() {
  saving.value = true
  error.value = ''
  msg.value = ''
  const payload = { labels: { ...labels }, colors: { ...colors } }
  try {
    await preferences.set('kanban.settings', payload)
    msg.value = 'Paramètres enregistrés.'
    await logs.create({ action: 'PATCH', itemtype: 'Preference', payload: JSON.stringify(payload), status: 'SUCCESS' }).catch(()=>{})
  } catch (e) {
    error.value = e.message || String(e)
    await logs.create({ action: 'PATCH', itemtype: 'Preference', status: 'ERROR', errorMessage: error.value }).catch(()=>{})
  } finally { saving.value = false }
}

onMounted(load)
</script>

<style scoped>
.settings-page { padding: 1.5rem; max-width:900px; margin:0 auto }
.panel { background: #fff; padding:1rem; border-radius:12px; border:1px solid var(--line) }
.row { display:flex; gap:0.6rem; align-items:center; margin:0.75rem 0 }
.row label { width:120px; font-weight:600 }
.row input[type="color"] { width:48px; height:34px; padding:0; border:none; background:none }
.row input[type="text"], .row input { flex:1; padding:0.5rem; border:1px solid #ddd; border-radius:8px }
.actions { display:flex; gap:0.6rem; margin-top:1rem }
.msg { color: green; margin-top:0.6rem }
.error { color: #c0392b; margin-top:0.6rem }
</style>
