'use client'
import { CircleAlert } from 'lucide-react'
export default function TasksError({ reset }: { reset: () => void }) { return <div className="workspace-page"><div className="tasks-empty"><CircleAlert size={32}/><h1>No pudimos cargar las tareas</h1><p>La información sigue segura. Intenta cargar esta vista nuevamente.</p><button className="workspace-button workspace-button-primary" onClick={reset}>Reintentar</button></div></div> }
