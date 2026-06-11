<template>
  <div class="tickets-page">
    <div class="page-header">
      <h1>Tickets</h1>
      <button class="btn-primary" @click="openCreate">Ajouter 1 ticket</button>
    </div>

    <!-- Barre de recherche et filtre statut -->
    <div class="toolbar">
      <input
        v-model="search"
        type="search"
        placeholder="Rechercher par nom…"
        class="search-input"
      />
      <select v-model="filterStatus" class="filter-select">
        <option value="">Tous les statuts</option>
        <option value="1">Nouveau</option>
        <option value="2">En cours (assigné)</option>
        <option value="3">En cours (planifié)</option>
        <option value="4">En attente</option>
        <option value="5">Résolu</option>
        <option value="6">Clos</option>
      </select>
      <button class="btn-secondary" @click="loadTickets">Rafraîchir</button>
    </div>

    <!-- État de chargement / erreur -->
    <div v-if="loading" class="state-msg">Chargement…</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <!-- Kanban board -->
    <div v-else class="kanban-wrapper">
      <div class="kanban">
        <div
          class="column"
          v-for="s in [1, 2, 6]"
          :key="s"
          @dragover.prevent
          @drop="onDrop($event, s)"
          :style="columnStyle(s)"
        >
          <div class="col-head">
            <h3>{{ statusLabel(s) }}</h3>
            <div class="col-count">{{ ticketsForStatus(s).length }}</div>
          </div>
          <div class="col-body">
            <div
              v-for="ticket in ticketsForStatus(s)"
              :key="ticket.id"
              class="ticket-card"
              draggable="true"
              @dragstart="onDragStart($event, ticket.id)"
              @click="openDetails(ticket)"
            >
              <div class="card-title">[{{ ticket.id }}] {{ ticket.name || '(sans titre)' }}</div>
              <div class="card-meta">
                <span class="muted">{{ typeLabel(ticket.type) }}</span>
                <span class="dot">•</span>
                <span class="muted">{{ priorityLabel(ticket.priority) }}</span>
              </div>
              <div class="card-actions">
                <button class="btn-icon btn-edit" title="Modifier" @click.stop="openEdit(ticket)">✎</button>
                <button class="btn-icon btn-delete" title="Supprimer" @click.stop="confirmDelete(ticket)">✕</button>
              </div>
            </div>
            <div v-if="ticketsForStatus(s).length===0" class="empty-col">Aucun ticket</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal création / édition -->
    <TicketModal
      v-if="showModal"
      :ticket="editingTicket"
      :saving="saving"
      :save-error="saveError"
      @save="onSave"
      @close="closeModal"
    />

    <!-- Détails ticket -->
    <TicketDetails v-if="detailTicket" :ticket="detailTicket" @close="detailTicket = null" />

    <!-- Confirmation suppression -->
    <div v-if="deletingTicket" class="overlay">
      <div class="confirm-modal">
        <h3>Supprimer le ticket</h3>
        <p>
          Confirmer la suppression du ticket
          <strong>[{{ deletingTicket.id }}] {{ deletingTicket.name }}</strong> ?
        </p>
        <p class="warn">Cette action est irréversible.</p>
        <div class="confirm-actions">
          <button class="btn-danger" :disabled="saving" @click="doDelete">
            {{ saving ? 'Suppression…' : 'Supprimer' }}
          </button>
          <button class="btn-secondary" @click="deletingTicket = null">Annuler</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { glpiApi } from '../services/glpiApi.js'
import { logs, preferences } from '../services/springApi.js'
import TicketModal from '../components/Tickets/TicketModal.vue'
import TicketDetails from '../components/Tickets/TicketDetails.vue'
import { useRouter } from 'vue-router'


const router = useRouter()
const tickets = ref([])
const loading = ref(false)
const error = ref(null)
const search = ref('')
const filterStatus = ref('')
const currentPage = ref(1)
const PAGE_SIZE = 20

const showModal = ref(false)
const editingTicket = ref(null)
const saving = ref(false)
const saveError = ref(null)
const deletingTicket = ref(null)
const detailTicket = ref(null)

const STATUS_LABELS = { 1: 'Nouveau', 2: 'En cours (attribué)', 3: 'En cours (planifié)', 4: 'En attente', 5: 'Résolu', 6: 'Clos' }
const STATUS_CLASSES = { 1: 's-new', 2: 's-assigned', 3: 's-planned', 4: 's-pending', 5: 's-solved', 6: 's-closed' }
const PRIORITY_LABELS = { 1: 'Très basse', 2: 'Basse', 3: 'Moyenne', 4: 'Haute', 5: 'Très haute', 6: 'Majeure' }
const PRIORITY_CLASSES = { 1: 'p-vlow', 2: 'p-low', 3: 'p-med', 4: 'p-high', 5: 'p-vhigh', 6: 'p-major' }
const TYPE_LABELS = { 1: 'Incident', 2: 'Demande' }

// Kanban settings (labels/colors) can be persisted in SQLite via spring preferences (key: 'kanban.settings')
const kanbanSettings = ref({ labels: {}, colors: {} })

function statusLabel(v) {
  // prefer persisted label for statuses 1..3
  if (kanbanSettings.value && kanbanSettings.value.labels && kanbanSettings.value.labels[v]) return kanbanSettings.value.labels[v]
  return STATUS_LABELS[v] ?? String(v)
}
function columnStyle(v) {
  const color = kanbanSettings.value?.colors?.[v]
  return color ? { background: color } : {}
}
function statusClass(v) { return STATUS_CLASSES[v] ?? '' }
function priorityLabel(v) { return PRIORITY_LABELS[v] ?? String(v) }
function priorityClass(v) { return PRIORITY_CLASSES[v] ?? '' }
function typeLabel(v) { return TYPE_LABELS[v] ?? 'Inconnu' }

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const filteredTickets = computed(() => {
  let list = tickets.value
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter((t) => (t.name ?? '').toLowerCase().includes(q))
  }
  if (filterStatus.value) {
    list = list.filter((t) => String(t.status) === filterStatus.value)
  }
  return list
})

const totalPages = computed(() => Math.ceil(filteredTickets.value.length / PAGE_SIZE))

const pagedTickets = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredTickets.value.slice(start, start + PAGE_SIZE)
})

// Remet la page à 1 quand le filtre change
import { watch } from 'vue'
watch([search, filterStatus], () => { currentPage.value = 1 })

async function loadTickets() {
  loading.value = true
  error.value = null
  try {
    tickets.value = await glpiApi.getItems('Ticket', { range: '0-999', sort: 'id', order: 'DESC' })
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Kanban helpers
function ticketsForStatus(statusId) {
  return filteredTickets.value.filter((t) => Number(t.status) === Number(statusId))
}

function onDragStart(event, ticketId) {
  event.dataTransfer.setData('text/plain', String(ticketId))
}

async function onDrop(event, newStatus) {
  event.preventDefault()
  const id = event.dataTransfer.getData('text/plain')
  if (!id) return
  const ticket = tickets.value.find((t) => String(t.id) === String(id))
  if (!ticket) return
  if (Number(ticket.status) === Number(newStatus)) return

  // optional prompt when assigning
  let extra = null
  if (Number(newStatus) === 2) {
    extra = window.prompt('Saisir un commentaire (optionnel) pour l\'assignation :')
  }

  const payload = { status: Number(newStatus) }
  if (extra && extra.trim()) payload.content = (ticket.content ?? '') + '\n' + extra

  try {
    await glpiApi.patchItem('Ticket', ticket.id, payload)
    // update local state
    const idx = tickets.value.findIndex((t) => t.id === ticket.id)
    if (idx !== -1) tickets.value[idx].status = Number(newStatus)
    await logs.create({ action: 'PATCH', itemtype: 'Ticket', glpiId: ticket.id, payload: JSON.stringify({ input: payload }), status: 'SUCCESS' }).catch(()=>{})
  } catch (e) {
    await logs.create({ action: 'PATCH', itemtype: 'Ticket', glpiId: ticket.id, status: 'ERROR', errorMessage: e.message }).catch(()=>{})
    alert('Erreur lors du changement de statut : ' + e.message)
  }
}


onMounted(loadTickets)

// load kanban settings
async function loadKanbanSettings() {
  try {
    const pref = await preferences.get('kanban.settings')
    if (pref && pref.value) {
      try {
        const val = JSON.parse(pref.value)
        kanbanSettings.value = val || { labels: {}, colors: {} }
      } catch (e) {
        // ignore malformed
      }
    }
  } catch (e) {
    // ignore not found
  }
}
onMounted(loadKanbanSettings)

// ── Création / édition ──────────────────────────────────────────────────────

function openCreate() {
  editingTicket.value = null
  saveError.value = null
  showModal.value = true
}

function openEdit(ticket) {
  editingTicket.value = { ...ticket }
  saveError.value = null
  showModal.value = true
}

async function openDetails(ticket) {
  // show basic details immediately
  detailTicket.value = { ...ticket, items: [] }
  try {
    // fetch all Item_Ticket associations and filter client-side to avoid relying on backend query params
    const raw = await glpiApi.getItemsRaw('Item_Ticket', { range: '0-999' })
    const assocList = Array.isArray(raw) ? raw : (raw.data || [])
    const filtered = assocList.filter((a) => String(a.tickets_id) === String(ticket.id))
    const fetched = []
    for (const a of filtered) {
      try {
        const item = await glpiApi.getItem(a.itemtype, a.items_id)
        fetched.push({ id: a.items_id, itemtype: a.itemtype, name: item.name ?? item.display_name ?? item.serial ?? String(a.items_id) })
      } catch (e) {
        fetched.push({ id: a.items_id, itemtype: a.itemtype, name: `#${a.items_id}` })
      }
    }
    detailTicket.value.items = fetched
  } catch (e) {
    // ignore — details view will show no items
  }
}

function closeModal() {
  showModal.value = false
  editingTicket.value = null
}

async function onSave(formData) {
  saving.value = true
  saveError.value = null
  try {
    if (editingTicket.value?.id) {
      // PATCH
      await glpiApi.patchItem('Ticket', editingTicket.value.id, formData)
      await logs.create({
        action: 'PATCH', itemtype: 'Ticket', glpiId: editingTicket.value.id,
        payload: JSON.stringify({ input: formData }), status: 'SUCCESS',
      }).catch(() => {})
      const idx = tickets.value.findIndex((t) => t.id === editingTicket.value.id)
      if (idx !== -1) tickets.value[idx] = { ...tickets.value[idx], ...formData }
    } else {
      // POST
      const created = await glpiApi.createItem('Ticket', formData)
      await logs.create({
        action: 'CREATE', itemtype: 'Ticket', glpiId: created.id,
        payload: JSON.stringify({ input: formData }), status: 'SUCCESS',
      }).catch(() => {})

      // If the modal emitted selected elements, create Item_Ticket associations
      if (Array.isArray(formData.items) && formData.items.length) {
        for (const it of formData.items) {
          try {
            await glpiApi.createItem('Item_Ticket', {
              tickets_id: created.id,
              itemtype: it.itemtype || it.itemType || it.item_type || null,
              items_id: it.id,
            })
          } catch (e) {
            // log but don't abort overall flow
            await logs.create({ action: 'CREATE', itemtype: 'Item_Ticket', status: 'ERROR', errorMessage: e.message }).catch(()=>{})
          }
        }
      }

      // Reload tickets to reflect associations
      await loadTickets()
    }
    closeModal()
  } catch (e) {
    saveError.value = e.message
    await logs.create({
      action: editingTicket.value?.id ? 'PATCH' : 'CREATE',
      itemtype: 'Ticket',
      status: 'ERROR',
      errorMessage: e.message,
    }).catch(() => {})
  } finally {
    saving.value = false
  }
}

// ── Suppression ─────────────────────────────────────────────────────────────

function confirmDelete(ticket) {
  deletingTicket.value = ticket
}

async function doDelete() {
  saving.value = true
  const ticket = deletingTicket.value
  try {
    await glpiApi.deleteItem('Ticket', ticket.id)
    await logs.create({
      action: 'DELETE', itemtype: 'Ticket', glpiId: ticket.id, status: 'SUCCESS',
    }).catch(() => {})
    tickets.value = tickets.value.filter((t) => t.id !== ticket.id)
    deletingTicket.value = null
  } catch (e) {
    error.value = e.message
    await logs.create({
      action: 'DELETE', itemtype: 'Ticket', glpiId: ticket.id,
      status: 'ERROR', errorMessage: e.message,
    }).catch(() => {})
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.tickets-page {
  padding: 1.5rem 2rem;
  max-width: 1100px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.2rem;
}
h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #222;
}
.toolbar {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.search-input {
  flex: 1;
  min-width: 180px;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.95rem;
}
.filter-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.95rem;
}
.state-msg {
  text-align: center;
  padding: 3rem;
  color: #888;
}
.error-msg {
  text-align: center;
  padding: 2rem;
  color: #e74c3c;
  background: #fdf3f3;
  border-radius: 6px;
}
.table-wrapper {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  overflow: hidden;
}
.tickets-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.tickets-table th {
  background: #f7f8fa;
  padding: 0.65rem 0.9rem;
  text-align: left;
  font-weight: 600;
  color: #555;
  border-bottom: 1px solid #e8e8e8;
  white-space: nowrap;
}
.tickets-table td {
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
}
.tickets-table tr:last-child td {
  border-bottom: none;
}
.tickets-table tr:hover td {
  background: #fafafa;
}

.clickable-row { cursor: pointer; }

/* Kanban styles */
.kanban { display:flex; gap:1rem; align-items:flex-start }
.column { background:var(--surface); border:1px solid var(--line); border-radius:12px; width:100%; max-width:360px; display:flex; flex-direction:column; min-height:260px }
.col-head { display:flex; align-items:center; justify-content:space-between; padding:0.8rem 1rem; border-bottom:1px solid var(--line) }
.col-head h3 { margin:0; font-size:1.05rem }
.col-count { background:var(--primary); color:#fff; padding:0.15rem 0.6rem; border-radius:999px; font-weight:700 }
.col-body { padding:0.8rem; display:flex; flex-direction:column; gap:0.6rem; min-height:120px }
.ticket-card { background:#fff; border-radius:10px; padding:0.6rem; box-shadow:var(--shadow-sm); cursor:grab; display:flex; flex-direction:column; gap:0.4rem; position:relative }
.ticket-card:active { cursor:grabbing }
.card-title { font-weight:700; font-size:0.95rem }
.card-meta { font-size:0.85rem; color:var(--muted) }
.card-actions { position:absolute; right:8px; top:8px; display:flex; gap:0.3rem }
.empty-col { color:var(--muted); font-style:italic; padding:0.6rem }

@media (max-width:900px) { .kanban { flex-direction:column } .column { max-width:100% } }
.col-id { width: 60px; }
.col-type { width: 90px; }
.col-status { width: 120px; }
.col-priority { width: 100px; }
.col-date { width: 105px; white-space: nowrap; }
.col-actions { width: 80px; text-align: center; }
.empty-row {
  text-align: center;
  color: #aaa;
  padding: 2.5rem;
  font-style: italic;
}

/* Badges statut */
.badge {
  display: inline-block;
  padding: 0.2rem 0.55rem;
  border-radius: 12px;
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}
.s-new      { background: #ebf5fb; color: #2980b9; }
.s-assigned { background: #eafaf1; color: #27ae60; }
.s-planned  { background: #fef9e7; color: #d4ac0d; }
.s-pending  { background: #fdf2e9; color: #e67e22; }
.s-solved   { background: #f4f6f7; color: #7f8c8d; }
.s-closed   { background: #f0f0f0; color: #999; }

/* Priorité */
.priority {
  font-size: 0.82rem;
  font-weight: 600;
}
.p-vlow  { color: #95a5a6; }
.p-low   { color: #27ae60; }
.p-med   { color: #2980b9; }
.p-high  { color: #e67e22; }
.p-vhigh { color: #e74c3c; }
.p-major { color: #c0392b; font-weight: 700; }

/* Boutons */
.btn-primary {
  background: #3498db;
  color: #fff;
  border: none;
  padding: 0.55rem 1.1rem;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-primary:hover { background: #2980b9; }

.btn-secondary {
  background: #fff;
  border: 1px solid #ccc;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
}
.btn-secondary:hover { background: #f5f5f5; }

.btn-danger {
  background: #e74c3c;
  color: #fff;
  border: none;
  padding: 0.55rem 1.1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
.btn-danger:hover:not(:disabled) { background: #c0392b; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  transition: background 0.15s;
}
.btn-edit  { color: #2980b9; }
.btn-edit:hover  { background: #ebf5fb; }
.btn-delete { color: #e74c3c; }
.btn-delete:hover { background: #fdf3f3; }

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-top: 1px solid #f0f0f0;
  font-size: 0.85rem;
  color: #666;
}
.page-controls { display: flex; gap: 0.5rem; }
.page-controls button {
  background: #fff;
  border: 1px solid #ddd;
  padding: 0.3rem 0.7rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}
.page-controls button:disabled { opacity: 0.4; cursor: not-allowed; }
.page-controls button:hover:not(:disabled) { background: #f5f5f5; }

/* Modal confirmation */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}
.confirm-modal {
  background: #fff;
  border-radius: 8px;
  padding: 2rem;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}
.confirm-modal h3 { margin: 0 0 0.75rem; }
.confirm-modal p { margin: 0.3rem 0; }
.warn { color: #e74c3c; font-weight: 600; margin-top: 0.5rem !important; }
.confirm-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.tickets-page {
  padding: 1.5rem;
  max-width: 1180px;
  margin: 0 auto;
  border-radius: var(--radius-xl);
}

.page-header {
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
}

.page-header h1 {
  font-size: clamp(1.6rem, 2vw, 2.2rem);
  color: var(--text-strong);
}

.toolbar {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 1rem;
}

.search-input,
.filter-select {
  min-height: 46px;
  border-radius: 14px;
}

.table-wrapper {
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-md);
}

.tickets-table th {
  background: rgba(19, 99, 223, 0.05);
  color: var(--text-strong);
}

.tickets-table td {
  background: rgba(255, 255, 255, 0.92);
}

.tickets-table tr:hover td {
  background: rgba(19, 99, 223, 0.03);
}

.btn-primary,
.btn-secondary,
.btn-danger,
.btn-icon {
  border-radius: 999px;
}

.btn-icon {
  width: 34px;
  height: 34px;
  display: inline-grid;
  place-items: center;
}

.pagination {
  background: rgba(255, 255, 255, 0.78);
  border-top: 1px solid var(--line);
}

.confirm-modal {
  border-radius: 24px;
  border: 1px solid var(--line);
}
</style>
