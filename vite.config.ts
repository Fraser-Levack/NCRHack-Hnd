import { defineConfig } from 'vite'
 
// https://vite.dev/config/
export default defineConfig({
  server: {
    allowedHosts: [
      'office-camping-teaching-certificates.trycloudflare.com',
      'ira-defined-reform-logged.trycloudflare.com',
      'lawn-bishop-animal-sleeping.trycloudflare.com'
    ]
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        txMenu: 'public/txMenu/txMenu.html',
        cashDeposit: 'public/cashDeposit/cashDeposit.html',
        withdrawal: 'public/withdrawal/withdrawal.html',
        balance: 'public/balance/balance.html',
        done: 'public/done/done.html',
        withdrawSuccess: 'public/withdrawSuccess/withdrawSuccess.html'
      }
    }
  }
})