import { progress } from '@clack/prompts'

interface ProgressBarProps {
  max: number
  style: "light" | "heavy" | "block"
}

const progressBar = ({max, style}: ProgressBarProps) => { 
  return progress({ max, style })
}

export default progressBar