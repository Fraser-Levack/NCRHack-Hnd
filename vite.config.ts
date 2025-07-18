import { defineConfig } from 'vite'
 
// https://vite.dev/config/
export default defineConfig({
  server: {
    allowedHosts: [
      'office-camping-teaching-certificates.trycloudflare.com',
      'ira-defined-reform-logged.trycloudflare.com',
      'lawn-bishop-animal-sleeping.trycloudflare.com'
    ]
  }
})