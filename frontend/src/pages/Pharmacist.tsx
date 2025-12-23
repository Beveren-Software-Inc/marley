const firstScreenPharma = ['Medicine Expiry Alert']

const otherScreensPharma = [
  'Pending Medication Requests',
  'IP Medication Orders',
  'Given Medicines History',
  'Stock Overview (dummy)'
]

export const PharmacistPage = () => {
  return (
    <div>
      <h1>Pharmacist Dashboard</h1>

      <section>
        <h2>First Screen</h2>
        <ul>
          {firstScreenPharma.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Other Screens</h2>
        <ul>
          {otherScreensPharma.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}



