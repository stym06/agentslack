import cron from 'node-cron'

export function startStandupCron() {
  // Schedule standup at 9 AM daily (0 9 * * *)
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily standup at', new Date().toISOString())

    try {
      const response = await fetch('http://localhost:3000/api/standup/trigger', {
        method: 'POST',
      })

      if (response.ok) {
        const data = await response.json()
        console.log('Standup completed:', data)
      } else {
        console.error('Standup trigger failed:', response.statusText)
      }
    } catch (error) {
      console.error('Error triggering standup:', error)
    }
  })

  console.log('Daily standup cron job scheduled for 9 AM')
}
