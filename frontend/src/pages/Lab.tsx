const firstScreenLab = ['Pending Sample Collection', 'Pending Lab Testing']

const otherScreensLab = [
  'Patient History (Medical History)',
  'Lab Test Setup (Admin)',
  'Lab Test Request (By Doctor)',
  'Lab Test (Outsourced)',
  'Sample Collection (Lab Person)',
  'Lab Test & Result (Lab Person)',
  'Lab Test Review (Doctor)',
  'Lab Test Report History (Lab & Doctor)'
]

export const LabPage = () => {
  return (
    <div>
      <h1>Lab User Dashboard</h1>

      <section>
        <h2>First Screen</h2>
        <ul>
          {firstScreenLab.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Other Screens</h2>
        <ol>
          {otherScreensLab.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}



