const adminSections = [
  'Overall Admissions Overview',
  'Branch Switch / Selection',
  'Doctor Activity Summary',
  'Nurse Activity Summary',
  'Lab Workload',
  'Pharmacy Workload',
  'Alerts & Warnings Summary'
]

export const AdminPage = () => {
  return (
    <div>
      <h1>Admin / Overall Dashboard</h1>
      <ul>
        {adminSections.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  )
}



