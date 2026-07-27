import type { Application, Posting, TermStat } from './types';

/**
 * Realistic fake WaterlooWorks data. Each posting's `raw` text mirrors the
 * real student-facing WaterlooWorks field labels verbatim (Job ID, Job
 * location, Employment location arrangement, Work term duration, Job summary,
 * Job responsibilities, Required skills, Compensation and benefits
 * information, Targeted degrees and disciplines, Application Deadline,
 * "N applications", "Number of Job Openings") so the demo exercises the same
 * parser + embedding path as real pasted data.
 */

interface DemoSpec {
  id: string;
  title: string;
  organization: string;
  division: string;
  location: string;
  arrangement: 'in-person' | 'remote' | 'hybrid';
  duration: string;
  summary: string;
  responsibilities: string;
  skills: string;
  compensation: string;
  hourlyRate: number | null;
  degrees: string;
  deadline: string;
  applications: number;
  openings: number;
}

function buildRaw(s: DemoSpec): string {
  const arrangementLabel =
    s.arrangement === 'in-person'
      ? 'In-person'
      : s.arrangement === 'remote'
        ? 'Remote'
        : 'Hybrid';
  return [
    `Job ID ${s.id}`,
    `Job Title ${s.title}`,
    `Organization ${s.organization}`,
    `Division ${s.division}`,
    `Job location ${s.location}`,
    `Employment location arrangement ${arrangementLabel}`,
    `Work term duration ${s.duration}`,
    `Job summary`,
    s.summary,
    `Job responsibilities`,
    s.responsibilities,
    `Required skills`,
    s.skills,
    `Compensation and benefits information`,
    s.compensation,
    `Targeted degrees and disciplines`,
    s.degrees,
    `Application Deadline ${s.deadline}`,
    `Application Documents Required Résumé, Cover Letter, Grade Report`,
    `${s.applications} applications`,
    `Number of Job Openings ${s.openings}`,
  ].join('\n');
}

function toPosting(s: DemoSpec): Posting {
  return {
    id: s.id,
    title: s.title,
    organization: s.organization,
    division: s.division,
    location: s.location,
    arrangement: s.arrangement,
    duration: s.duration,
    compensation: s.compensation,
    hourlyRate: s.hourlyRate,
    summary: s.summary,
    skills: s.skills,
    applications: s.applications,
    openings: s.openings,
    deadline: s.deadline,
    raw: buildRaw(s),
  };
}

const SPECS: DemoSpec[] = [
  {
    id: '412870',
    title: 'Software Developer Co-op (Frontend)',
    organization: 'Shopline Commerce',
    division: 'Storefront Platform',
    location: 'Toronto, ON',
    arrangement: 'hybrid',
    duration: '4 month work term',
    summary:
      'Join the Storefront Platform team building the merchant-facing storefront editor used by thousands of Canadian retailers. You will ship React features end-to-end alongside a small product squad.',
    responsibilities:
      'Build and ship UI features in React and TypeScript; collaborate with design on component library work; write unit tests; participate in code review and weekly demos.',
    skills:
      'Strong React and TypeScript fundamentals; familiarity with CSS and accessibility; interest in design systems; Git workflow experience.',
    compensation: '$32.00 - $36.00 per hour, plus $500 work-from-home stipend.',
    hourlyRate: 34,
    degrees: 'Computer Science, Software Engineering, Computer Engineering',
    deadline: 'September 22, 2025 09:00 AM',
    applications: 212,
    openings: 2,
  },
  {
    id: '413355',
    title: 'Full Stack Developer Co-op',
    organization: 'Maple Finance',
    division: 'Consumer Lending',
    location: 'Toronto, ON',
    arrangement: 'hybrid',
    duration: '4 month work term',
    summary:
      'Maple Finance is a fintech lender modernizing consumer credit in Canada. Work across our TypeScript/Node stack on loan origination flows handling real money movement.',
    responsibilities:
      'Develop features across React frontend and Node.js services; integrate with banking APIs; write integration tests; investigate production issues with senior engineers.',
    skills:
      'JavaScript/TypeScript, React, Node.js; SQL basics; interest in fintech and payments; attention to correctness and edge cases.',
    compensation: '$30.00 - $34.00 per hour depending on term.',
    hourlyRate: 32,
    degrees: 'Computer Science, Software Engineering, Mathematics',
    deadline: 'September 24, 2025 11:59 PM',
    applications: 148,
    openings: 3,
  },
  {
    id: '412104',
    title: 'Embedded Software Engineering Student',
    organization: 'NorthStar Robotics',
    division: 'Autonomy Systems',
    location: 'Kitchener, ON',
    arrangement: 'in-person',
    duration: '4 month work term',
    summary:
      'NorthStar builds autonomous mobile robots for warehouse logistics. You will write firmware and drivers for our sensor platform and see your code run on real robots every day.',
    responsibilities:
      'Develop C/C++ firmware for embedded Linux; write device drivers for lidar and IMU sensors; profile real-time performance; support field testing.',
    skills:
      'C/C++; understanding of microcontrollers and RTOS concepts; comfort with oscilloscopes and lab equipment an asset; Linux command line.',
    compensation: '$28.00 per hour plus overtime for field testing days.',
    hourlyRate: 28,
    degrees: 'Computer Engineering, Electrical Engineering, Mechatronics Engineering',
    deadline: 'September 23, 2025 09:00 AM',
    applications: 46,
    openings: 4,
  },
  {
    id: '414092',
    title: 'Machine Learning Research Intern',
    organization: 'Aurora AI Labs',
    division: 'Foundation Models',
    location: 'Toronto, ON',
    arrangement: 'in-person',
    duration: '4 or 8 month work term',
    summary:
      'Aurora AI Labs conducts research on efficient training of large language models. Interns work directly with research scientists on publishable work in model compression and evaluation.',
    responsibilities:
      'Run large-scale training experiments; implement papers in PyTorch; build evaluation harnesses; contribute to internal research notes and potentially publications.',
    skills:
      'Strong Python and PyTorch; ML coursework (deep learning, optimization); prior research or Kaggle experience preferred; distributed training exposure an asset.',
    compensation: '$45.00 per hour. Relocation support available.',
    hourlyRate: 45,
    degrees: 'Computer Science, Software Engineering, Statistics, Mathematics',
    deadline: 'September 20, 2025 09:00 AM',
    applications: 388,
    openings: 1,
  },
  {
    id: '413710',
    title: 'Backend Developer Co-op',
    organization: 'LoonPay',
    division: 'Payments Infrastructure',
    location: 'Remote, Canada',
    arrangement: 'remote',
    duration: '4 month work term',
    summary:
      'LoonPay processes payments for Canadian marketplaces. Our payments infrastructure team runs high-throughput Go services, and co-ops own real projects from design doc to deploy.',
    responsibilities:
      'Design and implement Go microservices; improve observability with metrics and tracing; participate in on-call shadowing; write design docs for your project.',
    skills:
      'One backend language (Go, Java, or Python); understanding of REST APIs and databases; interest in distributed systems; clear written communication.',
    compensation: '$33.00 per hour. Fully remote with quarterly team onsites.',
    hourlyRate: 33,
    degrees: 'Computer Science, Software Engineering, Computer Engineering',
    deadline: 'September 25, 2025 11:59 PM',
    applications: 96,
    openings: 5,
  },
  {
    id: '412955',
    title: 'QA Automation Developer',
    organization: 'Great Lakes Insurance Group',
    division: 'Digital Channels',
    location: 'Waterloo, ON',
    arrangement: 'in-person',
    duration: '4 month work term',
    summary:
      'Help modernize test automation for our customer-facing insurance quoting portal. A steady, mentorship-heavy team five minutes from campus.',
    responsibilities:
      'Build automated UI and API test suites with Playwright; triage regressions; improve CI pipeline reliability; document test plans.',
    skills:
      'JavaScript or Python; interest in software quality; familiarity with CI tools an asset; methodical debugging habits.',
    compensation: '$24.00 - $26.00 per hour.',
    hourlyRate: 25,
    degrees: 'Computer Science, Software Engineering, Management Engineering',
    deadline: 'September 26, 2025 09:00 AM',
    applications: 18,
    openings: 4,
  },
  {
    id: '414501',
    title: 'Product Software Engineer Intern',
    organization: 'Fernweh Travel Tech',
    division: 'Core Product',
    location: 'Remote, Canada',
    arrangement: 'remote',
    duration: '4 month work term',
    summary:
      'Fernweh is a 12-person startup building group-travel planning tools. Interns are treated as full engineers: you will talk to users, propose features, and ship them the same week.',
    responsibilities:
      'Ship full-stack features in React/TypeScript and Postgres; run small user interviews; own metrics for the features you ship; weekly product demos.',
    skills:
      'React and TypeScript; product sense and user empathy; comfort with ambiguity in a startup environment; SQL basics.',
    compensation: '$30.00 per hour plus meaningful equity options.',
    hourlyRate: 30,
    degrees: 'Computer Science, Software Engineering, Systems Design Engineering',
    deadline: 'September 27, 2025 11:59 PM',
    applications: 74,
    openings: 3,
  },
  {
    id: '413288',
    title: 'Firmware Developer Student',
    organization: 'BlueMaple Quantum',
    division: 'Control Systems',
    location: 'Waterloo, ON',
    arrangement: 'in-person',
    duration: '8 month work term',
    summary:
      'BlueMaple builds control electronics for superconducting quantum computers. You will write firmware that keeps qubits stable — genuinely hard real-time engineering.',
    responsibilities:
      'Develop FPGA-adjacent C firmware for timing-critical control loops; build hardware-in-the-loop test rigs; analyze latency with logic analyzers.',
    skills:
      'C programming; digital logic fundamentals; signal processing coursework an asset; curiosity about quantum computing (no prior QC knowledge required).',
    compensation: '$31.00 per hour. 8-month terms strongly preferred.',
    hourlyRate: 31,
    degrees: 'Computer Engineering, Electrical Engineering, Physics',
    deadline: 'September 21, 2025 09:00 AM',
    applications: 29,
    openings: 2,
  },
  {
    id: '414833',
    title: 'Data Engineering Co-op',
    organization: 'Prairie Analytics',
    division: 'Data Platform',
    location: 'Calgary, AB',
    arrangement: 'hybrid',
    duration: '4 month work term',
    summary:
      'Prairie Analytics provides agricultural yield forecasting to co-ops across Western Canada. Build the pipelines that turn satellite and sensor data into forecasts farmers rely on.',
    responsibilities:
      'Build and maintain Python/dbt data pipelines; optimize warehouse queries; add data quality checks; work with data scientists on feature datasets.',
    skills:
      'Python and SQL; interest in data modelling; Airflow or dbt exposure an asset; care for data correctness.',
    compensation: '$29.00 per hour plus housing stipend for relocating students.',
    hourlyRate: 29,
    degrees: 'Computer Science, Data Science, Statistics, Mathematics',
    deadline: 'September 28, 2025 09:00 AM',
    applications: 52,
    openings: 6,
  },
  {
    id: '412611',
    title: 'DevOps / Site Reliability Intern',
    organization: 'Cascadia Cloud',
    division: 'Platform Reliability',
    location: 'Vancouver, BC',
    arrangement: 'hybrid',
    duration: '4 month work term',
    summary:
      'Cascadia Cloud runs managed Kubernetes for Canadian enterprises. Join the reliability team automating infrastructure, chasing nines, and doing blameless postmortems properly.',
    responsibilities:
      'Automate infrastructure with Terraform; improve Kubernetes cluster monitoring; build internal CLI tooling in Go; participate in incident reviews.',
    skills:
      'Linux fundamentals; scripting in Python or Go; interest in infrastructure and networking; Docker/Kubernetes exposure an asset.',
    compensation: '$35.00 per hour.',
    hourlyRate: 35,
    degrees: 'Computer Science, Software Engineering, Computer Engineering',
    deadline: 'September 29, 2025 11:59 PM',
    applications: 131,
    openings: 2,
  },
];

export const demoPostings: Posting[] = SPECS.map(toPosting);

export const demoApplications: Application[] = [
  {
    id: '412870',
    title: 'Software Developer Co-op (Frontend)',
    organization: 'Shopline Commerce',
    division: 'Storefront Platform',
    rawStatus: 'Applied',
    status: 'applied',
    jobStatus: 'Filled',
    openings: 2,
  },
  {
    id: '413355',
    title: 'Full Stack Developer Co-op',
    organization: 'Maple Finance',
    division: 'Consumer Lending',
    rawStatus: 'Selected for Interview',
    status: 'selected_for_interview',
    jobStatus: 'Part Filled',
    openings: 3,
  },
  {
    id: '414092',
    title: 'Machine Learning Research Intern',
    organization: 'Aurora AI Labs',
    division: 'Foundation Models',
    rawStatus: 'Not Selected',
    status: 'not_selected',
    jobStatus: 'Filled',
    openings: 1,
  },
  {
    id: '413710',
    title: 'Backend Developer Co-op',
    organization: 'LoonPay',
    division: 'Payments Infrastructure',
    rawStatus: 'Applied',
    status: 'applied',
    jobStatus: 'Part Filled',
    openings: 5,
  },
  {
    id: '412955',
    title: 'QA Automation Developer',
    organization: 'Great Lakes Insurance Group',
    division: 'Digital Channels',
    rawStatus: 'Interviewed',
    status: 'interviewed',
    jobStatus: 'Part Filled',
    openings: 4,
  },
  {
    id: '413288',
    title: 'Firmware Developer Student',
    organization: 'BlueMaple Quantum',
    division: 'Control Systems',
    rawStatus: 'Applied',
    status: 'applied',
    jobStatus: 'Stalled',
    openings: 2,
  },
  {
    id: '404118',
    title: 'Junior Web Developer',
    organization: 'Grand River Media',
    division: 'Client Services',
    rawStatus: 'Not Selected',
    status: 'not_selected',
    jobStatus: 'Filled',
    openings: 1,
  },
  {
    id: '405772',
    title: 'IT Support Analyst Co-op',
    organization: 'Huron Mutual',
    division: 'Corporate IT',
    rawStatus: 'Application Withdrawn',
    status: 'withdrawn',
    jobStatus: 'Cancel',
    openings: 1,
  },
];

export const demoTermStat: TermStat = { submitted: 8, cap: 500 };
