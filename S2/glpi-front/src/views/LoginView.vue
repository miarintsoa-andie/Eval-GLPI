<template>
    <div class="login-page">
        <form class="login-form" @submit.prevent="onSubmit">
            <div class="logo">
                <span class="logo-text">GLPI-NewApp</span>
            </div>
            <h2>Connexion</h2>

            <!-- <div class="field">
        <label for="login">Identifiant</label>
        <input id="login" v-model="loginStr" type="text" required autocomplete="username" placeholder="glpi" />
      </div>

      <div class="field">
        <label for="password">Mot de passe</label>
        <input id="password" v-model="password" type="password" required autocomplete="current-password" placeholder="••••••" />
      </div> -->
            <div class="field">
                <label for="admin">Connexion admin</label>
                <input id="admin" v-model="admin" type="password" required autocomplete="current-password"
                    placeholder="••••••">
            </div>

            <p v-if="error" class="error">{{ error }}</p>

            <button type="submit" :disabled="loading">
                {{ loading ? 'Connexion…' : 'Se connecter' }}
            </button>
        </form>
    </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGlpiAuth } from '../composables/useGlpiAuth.js'
import { glpiApi } from '../services/glpiApi.js'

const router = useRouter()
// const loginStr = ref('glpi')
// const password = ref('glpi')
// const { loading, error, login } = useGlpiAuth()
// const ADMIN_PASS = 'admin123';

// async function onSubmit() {
//   await login(loginStr.value, password.value)
//   if (!error.value ) router.push('/tickets')
// }
const code = import.meta.env.VITE_BACKOFFICE_CODE || 'admin123'
const admin = ref(code)

const loading = ref(false)
const error = ref(null)

async function onSubmit() {
    if (admin.value !== code) {
        error.value = 'Code incorrect ! Reessayez ...'
        return
    }
    loading.value = true
    error.value = null
    try {
        await glpiApi.initSessionAuto()
        // notify app that session exists so navbars can appear
        window.dispatchEvent(new CustomEvent('glpi:session-created'))
        router.push('./tickets')
    } catch (e) {
        error.value = e.message
    } finally {
        loading.value = false
    }
}

</script>

<style scoped>
.login-page {
    min-height: calc(100vh - 2rem);
    display: grid;
    place-items: center;
    padding: 1rem;
}

.login-form {
    position: relative;
    overflow: hidden;
    width: min(420px, 100%);
    padding: 2.25rem 2rem;
    border-radius: var(--radius-xl);
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.login-form::before {
    content: '';
    position: absolute;
    inset: 0;
        background:
            radial-gradient(circle at top left, rgba(0,31,63,0.12), transparent 32%),
            radial-gradient(circle at bottom right, rgba(0,31,63,0.06), transparent 30%);
    pointer-events: none;
}

.logo {
    display: flex;
    justify-content: center;
    margin-bottom: 0.25rem;
    position: relative;
    z-index: 1;
}

.logo-text {
    background: linear-gradient(135deg, var(--primary), var(--primary-strong));
    color: #fff;
    font-size: 1.05rem;
    font-weight: 800;
    padding: 0.55rem 1rem;
    border-radius: 999px;
    letter-spacing: 0.18em;
    box-shadow: 0 10px 20px rgba(0,31,63,0.16);
}

h2 {
    margin: 0;
    font-size: 1.45rem;
    text-align: center;
    color: var(--text-strong);
    position: relative;
    z-index: 1;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    position: relative;
    z-index: 1;
}

label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
}

input {
    padding: 0.8rem 0.95rem;
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 14px;
    font-size: 1rem;
    transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
    background: rgba(255, 255, 255, 0.92);
}

input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 6px rgba(0,31,63,0.08);
}

.error {
    color: var(--black);
    font-size: 0.85rem;
    margin: 0;
    background: rgba(0,31,63,0.06);
    padding: 0.6rem 0.75rem;
    border-radius: 12px;
    position: relative;
    z-index: 1;
}

button {
    margin-top: 0.25rem;
    padding: 0.85rem;
    background: linear-gradient(135deg, var(--primary), var(--primary-strong));
    color: #fff;
    border: none;
    border-radius: 14px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.12s, box-shadow 0.12s;
    position: relative;
    z-index: 1;
    box-shadow: 0 10px 22px rgba(0,31,63,0.14);
}

button:hover:not(:disabled) {
    transform: translateY(-1px);
}

button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
