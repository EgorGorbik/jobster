/**
 * Default Active jobs + sample candidates created with a new workspace.
 */
import {randomUUID} from 'node:crypto';
import {normalizeJobPublicFields} from './job-public.mjs';

export const DEFAULT_JOB_TITLES = Object.freeze([
  {
    title: 'Программист',
    department: 'IT',
    location: 'Минск / Remote',
    openings: 2,
    pay: '2 500–4 000 USD / мес.',
    landingLayout: 'spotlight',
    description: [
      'Ищем fullstack-разработчика в продуктовую команду Falcon Jobster.',
      '',
      'Чем предстоит заниматься:',
      '• развивать веб-приложение на Node.js и современный фронтенд;',
      '• проектировать API, работу с SQLite/Postgres и интеграции (почта, Telegram);',
      '• участвовать в ревью кода, оценке задач и улучшении DX;',
      '• следить за стабильностью прод-окружения и качеством релизов.',
      '',
      'Ожидаем:',
      '• 3+ года коммерческой разработки (JavaScript/TypeScript);',
      '• опыт с Node.js, REST API, Git;',
      '• понимание HTML/CSS и доступности;',
      '• умение самостоятельно доводить задачу до продакшена.',
      '',
      'Будет плюсом: React, SQLite, Telegram Bot API, опыт hiring/HR-продуктов.',
      '',
      'Условия: удалёнка или гибрид, гибкий график, оплачиваемый отпуск, техника.'
    ].join('\n')
  },
  {
    title: 'Водитель',
    department: 'Operations',
    location: 'Минск · On-site',
    openings: 3,
    pay: '1 800–2 400 BYN / мес. + рейсы',
    landingLayout: 'classic',
    description: [
      'Открыта вакансия водителя категории C/CE для регулярных рейсов по Беларуси и СНГ.',
      '',
      'Обязанности:',
      '• перевозка грузов по согласованным маршрутам;',
      '• контроль состояния ТС и своевременное ТО;',
      '• соблюдение ПДД, режима труда и отдыха;',
      '• оформление путевых листов и сдача документов в офис.',
      '',
      'Требования:',
      '• действующие права категории C (CE — преимущество);',
      '• стаж вождения грузового транспорта от 2 лет;',
      '• аккуратный стиль вождения, без грубых нарушений;',
      '• готовность к рейсам 2–5 дней.',
      '',
      'Мы предоставляем: исправный автопарк, топливные карты, суточные, медстраховку,',
      'стабильные выплаты 2 раза в месяц.'
    ].join('\n')
  },
  {
    title: 'Диспетчер',
    department: 'Operations',
    location: 'Минск · Office',
    openings: 1,
    pay: '1 600–2 200 BYN / мес.',
    landingLayout: 'compact',
    description: [
      'Ищем диспетчера логистики в офис в Минске — координация водителей и клиентов.',
      '',
      'Задачи:',
      '• планирование рейсов и загрузка транспорта;',
      '• связь с водителями и заказчиками в течение смены;',
      '• ведение заявок в TMS/Excel, контроль сроков доставки;',
      '• оперативное решение сбоев на маршруте;',
      '• отчётность по выполненным рейсам.',
      '',
      'Нужны:',
      '• опыт в логистике/диспетчеризации от 1 года;',
      '• уверенный Excel, навык работы с несколькими задачами сразу;',
      '• грамотная речь, стрессоустойчивость;',
      '• готовность к сменному графику (включая выходные по графику).',
      '',
      'Офис рядом с метро, корпоративная связь, обучение TMS, премии за KPI.'
    ].join('\n')
  },
  {
    title: 'Строитель',
    department: 'Construction',
    location: 'Минск и область · On-site',
    openings: 4,
    pay: '18–28 BYN / час',
    landingLayout: 'classic',
    description: [
      'Набираем строителей на объекты жилого и коммерческого строительства.',
      '',
      'Работы:',
      '• монолитные и общестроительные работы;',
      '• арматура, опалубка, бетон;',
      '• подготовка площадки и соблюдение техники безопасности;',
      '• взаимодействие с прорабом и бригадой.',
      '',
      'Требования:',
      '• опыт на стройке от 1 года;',
      '• знание основ ОТ и ПБ;',
      '• физическая выносливость, аккуратность;',
      '• наличие инструментов — преимущество.',
      '',
      'Условия: официальное оформление, спецодежда, транспорт до объекта,',
      'сдельная/почасовая оплата, аванс и расчёт без задержек.'
    ].join('\n')
  }
]);

/** Fake people per job title — stages spread across the pipeline. */
const CANDIDATES_BY_JOB = Object.freeze({
  'Программист': [
    {
      name: 'Алексей Котов', email: 'alexey.kotov@example.com', phone: '+375291112233',
      telegram: 'alex_kotov_dev', stage: 'New', location: 'Минск', experience: '3 года',
      rating: 72, favorite: false, tags: ['JavaScript', 'React', 'Node'],
      notes: 'Отклик с career landing. Сильный фронт, хочет fullstack.'
    },
    {
      name: 'Мария Смирнова', email: 'maria.smirnova@example.com', phone: '+375297778899',
      telegram: 'm_smirnova', stage: 'Screening', location: 'Москва', experience: '5 лет',
      rating: 88, favorite: true, tags: ['TypeScript', 'Node', 'PostgreSQL'],
      notes: 'Скрининг пройден. Портфолио: 2 SaaS-продукта. Назначить техсобесед.'
    },
    {
      name: 'Иван Петров', email: 'ivan.petrov.dev@example.com', phone: '+375333445566',
      telegram: 'ivan_petrov_js', stage: 'Interview', location: 'Remote', experience: '4 года',
      rating: 81, favorite: false, tags: ['Python', 'Django', 'Docker'],
      notes: 'Интервью в календаре. Интерес к backend и интеграциям.'
    }
  ],
  'Водитель': [
    {
      name: 'Сергей Иванов', email: 'sergey.ivanov@example.com', phone: '+375291234567',
      telegram: 'sergey_driver', stage: 'New', location: 'Минск', experience: '7 лет',
      rating: 65, favorite: false, tags: ['категория C', 'дальнобой'],
      notes: 'Права C, опыт СНГ. Готов выйти со следующей недели.'
    },
    {
      name: 'Павел Орлов', email: 'pavel.orlov@example.com', phone: '+375295551122',
      telegram: 'pavel_orlov_c', stage: 'Screening', location: 'Гомель', experience: '2 года',
      rating: 70, favorite: false, tags: ['категория C', 'регион'],
      notes: 'Проверили права. Нужна медсправка до оффера.'
    },
    {
      name: 'Дмитрий Волков', email: 'dmitry.volkov@example.com', phone: '+375336667788',
      telegram: 'dvolkov_adr', stage: 'Offer', location: 'Брест', experience: '10 лет',
      rating: 93, favorite: true, tags: ['CE', 'ADR'],
      notes: 'Оффер отправлен. ADR в порядке, ждём ответ до пятницы.'
    }
  ],
  'Диспетчер': [
    {
      name: 'Елена Васильева', email: 'elena.vasileva@example.com', phone: '+375291001122',
      telegram: 'elena_vas', stage: 'New', location: 'Минск', experience: '4 года',
      rating: 74, favorite: false, tags: ['логистика', 'TMS'],
      notes: 'Опыт в 3PL. Удобен график 2/2.'
    },
    {
      name: 'Ольга Новикова', email: 'olga.novikova@example.com', phone: '+375449998877',
      telegram: 'olga_novikova', stage: 'Interview', location: 'Гродно', experience: '6 лет',
      rating: 86, favorite: true, tags: ['WMS', 'Excel', 'English'],
      notes: 'Сильный Excel/WMS. Рассматривает переезд в Минск.'
    },
    {
      name: 'Андрей Соколов', email: 'andrey.sokolov@example.com', phone: '+375333221100',
      telegram: 'andrey_disp', stage: 'Screening', location: 'Витебск', experience: '1 год',
      rating: 58, favorite: false, tags: ['сменный график'],
      notes: 'Мало опыта, но мотивация высокая. Стажировка возможна.'
    }
  ],
  'Строитель': [
    {
      name: 'Николай Морозов', email: 'nikolay.morozov@example.com', phone: '+375297001122',
      telegram: 'nmorozov_build', stage: 'New', location: 'Минск', experience: '8 лет',
      rating: 79, favorite: false, tags: ['монолит', 'опалубка'],
      notes: 'Бригадирский опыт. Готов на объекты в области.'
    },
    {
      name: 'Виктор Кузнецов', email: 'viktor.kuznetsov@example.com', phone: '+375291112244',
      telegram: 'viktor_kuz', stage: 'Hired', location: 'Могилёв', experience: '12 лет',
      rating: 95, favorite: true, tags: ['отделка', 'плитка'],
      notes: 'Вышел на объект «Северный». Документы в HR.'
    },
    {
      name: 'Роман Белов', email: 'roman.belov@example.com', phone: '+375333445577',
      telegram: 'roman_belov_arm', stage: 'Screening', location: 'Брест', experience: '3 года',
      rating: 68, favorite: false, tags: ['арматура'],
      notes: 'Проверка документов. Нужен инструктаж по ОТ.'
    }
  ]
});

const COLORS = ['#deebe6', '#e7e1f0', '#f5e5d5', '#dce7ef', '#f0e1e8', '#e1ecd8'];

export function buildDefaultJobs({owner = '', company = 'Falcon Jobster'} = {}) {
  const now = new Date().toISOString();
  const ownerName = String(owner || company).slice(0, 120) || company;
  return DEFAULT_JOB_TITLES.map(job => normalizeJobPublicFields({
    id: randomUUID(),
    title: job.title,
    department: job.department,
    location: job.location,
    openings: job.openings,
    status: 'Active',
    pay: job.pay,
    owner: ownerName,
    description: job.description,
    landingLayout: job.landingLayout,
    publicEnabled: true,
    createdAt: now
  }));
}

/**
 * @param {object[]} jobs — jobs from buildDefaultJobs (or existing)
 * @param {{owner?: string, company?: string}} opts
 */
export function buildDefaultCandidates(jobs, {owner = '', company = 'Falcon Jobster'} = {}) {
  const ownerName = String(owner || company).slice(0, 120) || company;
  const now = Date.now();
  const iso = ms => new Date(ms).toISOString();
  const out = [];
  let colorIdx = 0;
  for (const job of jobs || []) {
    const people = CANDIDATES_BY_JOB[job.title] || [];
    people.forEach((person, i) => {
      const createdAt = iso(now - (i + 1) * 86400000);
      out.push({
        id: randomUUID(),
        name: person.name,
        email: person.email,
        phone: person.phone || '',
        telegram: person.telegram || '',
        telegramChatId: '',
        telegramLinkedAt: '',
        location: person.location,
        jobId: job.id,
        source: 'Seed',
        rating: person.rating ?? null,
        stage: person.stage,
        experience: person.experience,
        owner: ownerName,
        tags: [...(person.tags || []), 'seed'],
        notes: person.notes || `Sample candidate for «${job.title}».`,
        favorite: !!person.favorite,
        archived: false,
        color: COLORS[colorIdx++ % COLORS.length],
        createdAt,
        updatedAt: createdAt,
        history: [{
          id: randomUUID(),
          type: 'created',
          text: 'Sample candidate seeded',
          stage: person.stage,
          at: createdAt
        }]
      });
    });
  }
  return out;
}

/** Patch existing default-titled jobs with rich seed content (idempotent by title). */
export function applyDefaultJobContent(jobs, {owner = ''} = {}) {
  const byTitle = new Map(DEFAULT_JOB_TITLES.map(j => [j.title, j]));
  return (jobs || []).map(job => {
    const seed = byTitle.get(job.title);
    if (!seed) return job;
    return normalizeJobPublicFields({
      ...job,
      department: seed.department,
      location: seed.location,
      openings: seed.openings,
      pay: seed.pay,
      description: seed.description,
      landingLayout: seed.landingLayout,
      publicEnabled: true,
      status: job.status || 'Active',
      owner: job.owner || owner
    });
  });
}

/** Enrich existing seed candidates (matched by email) with full demo fields. */
export function applyDefaultCandidateContent(candidates) {
  const byEmail = new Map();
  for (const people of Object.values(CANDIDATES_BY_JOB)) {
    for (const p of people) byEmail.set(p.email, p);
  }
  return (candidates || []).map(c => {
    const seed = byEmail.get(c.email);
    if (!seed) return c;
    return {
      ...c,
      phone: seed.phone || c.phone || '',
      telegram: seed.telegram || c.telegram || '',
      location: seed.location || c.location,
      experience: seed.experience || c.experience,
      rating: seed.rating ?? c.rating,
      stage: c.stage || seed.stage,
      favorite: seed.favorite ?? c.favorite,
      notes: seed.notes || c.notes,
      tags: Array.from(new Set([...(seed.tags || []), ...(c.tags || []), 'seed'])),
      source: c.source || 'Seed',
      updatedAt: new Date().toISOString()
    };
  });
}

/** Jobs + candidates ready for a fresh workspace. */
export function buildDefaultSeed({owner = '', company = 'Falcon Jobster'} = {}) {
  const jobs = buildDefaultJobs({owner, company});
  const candidates = buildDefaultCandidates(jobs, {owner, company});
  return {jobs, candidates};
}
