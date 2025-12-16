"use client";
import { useState } from "react";

export default function AnalyticsDashboard() {
  const [week, setWeek] = useState("Week 1");

  const data = {
    plannedHours: 20,
    completedHours: 15,
    postponed: 2,
    canceled: 1,
    priorities: {
      High: 4,
      Medium: 3,
      Low: 1
    },
    constraintImpact: 30 // %
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Analytics Dashboard</h1>

      {/* Filters */}
      <div style={{ marginBottom: "20px" }}>
        <label>Week: </label>
        <select value={week} onChange={(e) => setWeek(e.target.value)}>
          <option>Week 1</option>
          <option>Week 2</option>
          <option>Week 3</option>
        </select>
      </div>

      {/* Metrics */}
      <h3>Weekly Summary</h3>
      <ul>
        <li>Planned Hours: {data.plannedHours}</li>
        <li>Completed Hours: {data.completedHours}</li>
        <li>Postponed Tasks: {data.postponed}</li>
        <li>Canceled Tasks: {data.canceled}</li>
        <li>Constraint Impact: %{data.constraintImpact}</li>
      </ul>

      {/* Simple Charts (text-based first iteration) */}
      <h3>Planned vs Completed</h3>
      <div>
        Planned: {"█".repeat(data.plannedHours / 2)}  
        <br />
        Completed: {"█".repeat(data.completedHours / 2)}
      </div>

      <h3>Goal Priority Distribution</h3>
      <div>
        High: {"■".repeat(data.priorities.High)}  
        <br />
        Medium: {"■".repeat(data.priorities.Medium)}  
        <br />
        Low: {"■".repeat(data.priorities.Low)}
      </div>
    </div>
  );
}
