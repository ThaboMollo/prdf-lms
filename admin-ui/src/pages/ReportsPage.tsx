import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import { createReportsUseCases } from '../logic/usecases/reports'
import { formatCurrency } from '../lib/format'
import { PageHeader } from '../components/shared/PageHeader'

type ReportsPageProps = {
  session: Session
}

export function ReportsPage({ session }: ReportsPageProps) {
  const [timeRange, setTimeRange] = useState('all') // '30', '90', 'all'
  const reportsUseCases = useMemo(() => createReportsUseCases(session.access_token), [session.access_token])

  const pipelineQuery = useQuery({
    queryKey: ['reports-pipeline', session.user.id],
    queryFn: () => reportsUseCases.getPipelineSummary()
  })

  const originationQuery = useQuery({
    queryKey: ['reports-origination', session.user.id],
    queryFn: () => reportsUseCases.getOriginationTrends()
  })

  // Format pipeline data for chart
  const pipelineData = useMemo(() => {
    if (!pipelineQuery.data) return []
    return pipelineQuery.data.map((item) => ({
      name: item.status,
      count: item.count,
      totalAmount: item.totalAmount
    }))
  }, [pipelineQuery.data])

  // Formate origination data for chart
  const originationData = useMemo(() => {
    if (!originationQuery.data) return []
    return originationQuery.data.map((item) => ({
      name: item.month, // 'YYYY-MM'
      count: item.count,
      amount: item.totalAmount
    }))
  }, [originationQuery.data])

  const handleExportCsv = (type: 'pipeline' | 'origination') => {
    let csv = ''
    let filename = ''

    if (type === 'pipeline' && pipelineQuery.data) {
      csv = 'Status,Count,TotalAmount\n' + pipelineQuery.data.map(i => `${i.status},${i.count},${i.totalAmount}`).join('\n')
      filename = 'pipeline_summary.csv'
    } else if (type === 'origination' && originationQuery.data) {
      csv = 'Month,LoansOriginated,TotalVolume\n' + originationQuery.data.map(i => `${i.month},${i.count},${i.totalAmount}`).join('\n')
      filename = 'origination_trends.csv'
    }

    if (!csv) return

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="stack">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Monitor pipeline performance, origination trends, and export metric summaries."
        actions={
          <select className="input" value={timeRange} onChange={e => setTimeRange(e.target.value)}>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
        }
      />

      <div className="grid-two">
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Pipeline Status Summary</h3>
          {pipelineQuery.isLoading ? <p>Loading...</p> : (
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={pipelineData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }} 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                  />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} name="Applications" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Origination Volume Trend</h3>
          {originationQuery.isLoading ? <p>Loading...</p> : (
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={originationData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={val => `$${val/1000}k`} />
                  <Tooltip 
                    formatter={(value: any) => formatCurrency(Number(value) || 0)}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                  />
                  <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} name="Total Volume" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Export Center</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Download aggregated data for external analysis.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report Type</th>
                <th>Description</th>
                <th>Format</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Pipeline Snapshot</strong></td>
                <td>Current breakdown of applications by status and total requested amounts.</td>
                <td><span className="status-badge status-neutral">CSV</span></td>
                <td><button className="link-btn" onClick={() => handleExportCsv('pipeline')}>Download</button></td>
              </tr>
              <tr>
                <td><strong>Origination Trends</strong></td>
                <td>Month-over-month disbursed loan volume and counts.</td>
                <td><span className="status-badge status-neutral">CSV</span></td>
                <td><button className="link-btn" onClick={() => handleExportCsv('origination')}>Download</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
