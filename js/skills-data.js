/* gapNinja — curated skills taxonomy
   Each skill: { name, category, aliases[], doc (optional direct link) }
   Matching is alias-based, case-insensitive, whole-phrase.
*/
(function (global) {
  const SKILLS = [
    // --- Languages ---
    { name: "JavaScript", category: "Languages", aliases: ["javascript", "js", "es6", "ecmascript"], doc: "https://developer.mozilla.org/en-US/docs/Web/JavaScript" },
    { name: "TypeScript", category: "Languages", aliases: ["typescript", "ts"], doc: "https://www.typescriptlang.org/docs/" },
    { name: "Python", category: "Languages", aliases: ["python", "python3"], doc: "https://docs.python.org/3/tutorial/" },
    { name: "Java", category: "Languages", aliases: ["java"], doc: "https://docs.oracle.com/en/java/" },
    { name: "C#", category: "Languages", aliases: ["c#", "csharp", ".net c#"], doc: "https://learn.microsoft.com/en-us/dotnet/csharp/" },
    { name: "C++", category: "Languages", aliases: ["c++", "cpp"], doc: "https://en.cppreference.com/w/" },
    { name: "C", category: "Languages", aliases: [" c programming", "c language"], doc: "https://en.cppreference.com/w/c" },
    { name: "Go", category: "Languages", aliases: ["golang", " go "], doc: "https://go.dev/doc/" },
    { name: "Rust", category: "Languages", aliases: ["rust"], doc: "https://doc.rust-lang.org/book/" },
    { name: "Ruby", category: "Languages", aliases: ["ruby"], doc: "https://www.ruby-lang.org/en/documentation/" },
    { name: "PHP", category: "Languages", aliases: ["php"], doc: "https://www.php.net/docs.php" },
    { name: "Swift", category: "Languages", aliases: ["swift"], doc: "https://www.swift.org/documentation/" },
    { name: "Kotlin", category: "Languages", aliases: ["kotlin"], doc: "https://kotlinlang.org/docs/home.html" },
    { name: "SQL", category: "Languages", aliases: ["sql"], doc: "https://www.w3schools.com/sql/" },
    { name: "R", category: "Languages", aliases: ["r programming", " r language"], doc: "https://www.r-project.org/other-docs.html" },
    { name: "Scala", category: "Languages", aliases: ["scala"], doc: "https://docs.scala-lang.org/" },
    { name: "Bash/Shell", category: "Languages", aliases: ["bash", "shell scripting", "shell script"], doc: "https://www.gnu.org/software/bash/manual/" },

    // --- Frontend ---
    { name: "React", category: "Frontend", aliases: ["react", "react.js", "reactjs"], doc: "https://react.dev/learn" },
    { name: "Next.js", category: "Frontend", aliases: ["next.js", "nextjs"], doc: "https://nextjs.org/docs" },
    { name: "Vue.js", category: "Frontend", aliases: ["vue.js", "vuejs", "vue"], doc: "https://vuejs.org/guide/introduction.html" },
    { name: "Angular", category: "Frontend", aliases: ["angular", "angularjs"], doc: "https://angular.dev/overview" },
    { name: "Svelte", category: "Frontend", aliases: ["svelte"], doc: "https://svelte.dev/docs" },
    { name: "HTML/CSS", category: "Frontend", aliases: ["html", "css", "html5", "css3"], doc: "https://developer.mozilla.org/en-US/docs/Web/HTML" },
    { name: "Tailwind CSS", category: "Frontend", aliases: ["tailwind", "tailwindcss"], doc: "https://tailwindcss.com/docs" },
    { name: "Redux", category: "Frontend", aliases: ["redux"], doc: "https://redux.js.org/introduction/getting-started" },
    { name: "Sass/LESS", category: "Frontend", aliases: ["sass", "scss", "less"], doc: "https://sass-lang.com/documentation/" },
    { name: "Webpack", category: "Frontend", aliases: ["webpack"], doc: "https://webpack.js.org/concepts/" },
    { name: "Responsive Design", category: "Frontend", aliases: ["responsive design", "mobile-first"], doc: "https://web.dev/learn/design/" },

    // --- Backend ---
    { name: "Node.js", category: "Backend", aliases: ["node.js", "nodejs", "node"], doc: "https://nodejs.org/en/learn" },
    { name: "Express.js", category: "Backend", aliases: ["express.js", "expressjs", "express"], doc: "https://expressjs.com/en/starter/installing.html" },
    { name: "Django", category: "Backend", aliases: ["django"], doc: "https://docs.djangoproject.com/" },
    { name: "Flask", category: "Backend", aliases: ["flask"], doc: "https://flask.palletsprojects.com/" },
    { name: "FastAPI", category: "Backend", aliases: ["fastapi"], doc: "https://fastapi.tiangolo.com/" },
    { name: "Spring Boot", category: "Backend", aliases: ["spring boot", "spring framework"], doc: "https://spring.io/guides" },
    { name: "Ruby on Rails", category: "Backend", aliases: ["ruby on rails", "rails"], doc: "https://guides.rubyonrails.org/" },
    { name: ".NET", category: "Backend", aliases: [".net", "asp.net", "dotnet"], doc: "https://learn.microsoft.com/en-us/dotnet/" },
    { name: "GraphQL", category: "Backend", aliases: ["graphql"], doc: "https://graphql.org/learn/" },
    { name: "REST APIs", category: "Backend", aliases: ["rest api", "restful", "rest apis"], doc: "https://restfulapi.net/" },
    { name: "Microservices", category: "Backend", aliases: ["microservices", "microservice architecture"], doc: "https://microservices.io/" },

    // --- Data / Databases ---
    { name: "PostgreSQL", category: "Data", aliases: ["postgresql", "postgres"], doc: "https://www.postgresql.org/docs/" },
    { name: "MySQL", category: "Data", aliases: ["mysql"], doc: "https://dev.mysql.com/doc/" },
    { name: "MongoDB", category: "Data", aliases: ["mongodb", "mongo"], doc: "https://www.mongodb.com/docs/" },
    { name: "Redis", category: "Data", aliases: ["redis"], doc: "https://redis.io/docs/latest/" },
    { name: "Elasticsearch", category: "Data", aliases: ["elasticsearch"], doc: "https://www.elastic.co/guide/index.html" },
    { name: "Data Analysis", category: "Data", aliases: ["data analysis", "data analytics"], doc: null },
    { name: "Data Visualization", category: "Data", aliases: ["data visualization", "dashboards"], doc: null },
    { name: "ETL", category: "Data", aliases: ["etl", "data pipelines"], doc: null },
    { name: "Pandas", category: "Data", aliases: ["pandas"], doc: "https://pandas.pydata.org/docs/" },
    { name: "NumPy", category: "Data", aliases: ["numpy"], doc: "https://numpy.org/doc/" },
    { name: "Excel", category: "Data", aliases: ["excel", "microsoft excel", "advanced excel"], doc: null },
    { name: "Tableau", category: "Data", aliases: ["tableau"], doc: "https://help.tableau.com/current/pro/desktop/en-us/" },
    { name: "Power BI", category: "Data", aliases: ["power bi", "powerbi"], doc: "https://learn.microsoft.com/en-us/power-bi/" },

    // --- AI / ML ---
    { name: "Machine Learning", category: "AI/ML", aliases: ["machine learning", " ml "], doc: null },
    { name: "Deep Learning", category: "AI/ML", aliases: ["deep learning"], doc: null },
    { name: "Natural Language Processing", category: "AI/ML", aliases: ["natural language processing", " nlp "], doc: null },
    { name: "TensorFlow", category: "AI/ML", aliases: ["tensorflow"], doc: "https://www.tensorflow.org/learn" },
    { name: "PyTorch", category: "AI/ML", aliases: ["pytorch"], doc: "https://pytorch.org/tutorials/" },
    { name: "LLMs / Generative AI", category: "AI/ML", aliases: ["llm", "large language model", "generative ai", "genai"], doc: null },
    { name: "Computer Vision", category: "AI/ML", aliases: ["computer vision"], doc: null },

    // --- Cloud / DevOps ---
    { name: "AWS", category: "Cloud/DevOps", aliases: ["aws", "amazon web services"], doc: "https://docs.aws.amazon.com/" },
    { name: "Azure", category: "Cloud/DevOps", aliases: ["azure", "microsoft azure"], doc: "https://learn.microsoft.com/en-us/azure/" },
    { name: "Google Cloud Platform", category: "Cloud/DevOps", aliases: ["gcp", "google cloud"], doc: "https://cloud.google.com/docs" },
    { name: "Docker", category: "Cloud/DevOps", aliases: ["docker", "containerization"], doc: "https://docs.docker.com/get-started/" },
    { name: "Kubernetes", category: "Cloud/DevOps", aliases: ["kubernetes", "k8s"], doc: "https://kubernetes.io/docs/tutorials/" },
    { name: "CI/CD", category: "Cloud/DevOps", aliases: ["ci/cd", "continuous integration", "continuous deployment"], doc: null },
    { name: "Terraform", category: "Cloud/DevOps", aliases: ["terraform", "infrastructure as code"], doc: "https://developer.hashicorp.com/terraform/docs" },
    { name: "Jenkins", category: "Cloud/DevOps", aliases: ["jenkins"], doc: "https://www.jenkins.io/doc/" },
    { name: "Git", category: "Cloud/DevOps", aliases: ["git", "version control"], doc: "https://git-scm.com/doc" },
    { name: "Linux", category: "Cloud/DevOps", aliases: ["linux", "unix"], doc: "https://linuxjourney.com/" },
    { name: "Monitoring/Observability", category: "Cloud/DevOps", aliases: ["monitoring", "observability", "datadog", "grafana", "prometheus"], doc: null },

    // --- Testing / QA ---
    { name: "Unit Testing", category: "Testing", aliases: ["unit testing", "unit tests"], doc: null },
    { name: "Test Automation", category: "Testing", aliases: ["test automation", "automated testing"], doc: null },
    { name: "Selenium", category: "Testing", aliases: ["selenium"], doc: "https://www.selenium.dev/documentation/" },
    { name: "Cypress", category: "Testing", aliases: ["cypress"], doc: "https://docs.cypress.io/" },
    { name: "Jest", category: "Testing", aliases: ["jest"], doc: "https://jestjs.io/docs/getting-started" },

    // --- Product / Design ---
    { name: "Product Management", category: "Product/Design", aliases: ["product management", "product owner"], doc: null },
    { name: "UX/UI Design", category: "Product/Design", aliases: ["ux design", "ui design", "ux/ui"], doc: null },
    { name: "Figma", category: "Product/Design", aliases: ["figma"], doc: "https://help.figma.com/hq/en-us" },
    { name: "Wireframing", category: "Product/Design", aliases: ["wireframing", "prototyping"], doc: null },
    { name: "User Research", category: "Product/Design", aliases: ["user research", "usability testing"], doc: null },
    { name: "A/B Testing", category: "Product/Design", aliases: ["a/b testing", "ab testing"], doc: null },
    { name: "Agile/Scrum", category: "Product/Design", aliases: ["agile", "scrum", "kanban"], doc: null },
    { name: "Roadmapping", category: "Product/Design", aliases: ["roadmapping", "product roadmap"], doc: null },

    // --- Management / Business ---
    { name: "Project Management", category: "Management", aliases: ["project management", "pmp"], doc: null },
    { name: "Stakeholder Management", category: "Management", aliases: ["stakeholder management"], doc: null },
    { name: "Budgeting", category: "Management", aliases: ["budgeting", "forecasting"], doc: null },
    { name: "People Management", category: "Management", aliases: ["people management", "team leadership", "line management"], doc: null },
    { name: "Cross-functional Collaboration", category: "Management", aliases: ["cross-functional", "cross functional collaboration"], doc: null },
    { name: "Vendor Management", category: "Management", aliases: ["vendor management"], doc: null },
    { name: "Change Management", category: "Management", aliases: ["change management"], doc: null },

    // --- Marketing / Sales ---
    { name: "SEO", category: "Marketing/Sales", aliases: ["seo", "search engine optimization"], doc: "https://developers.google.com/search/docs" },
    { name: "Content Marketing", category: "Marketing/Sales", aliases: ["content marketing", "copywriting"], doc: null },
    { name: "Google Analytics", category: "Marketing/Sales", aliases: ["google analytics", "ga4"], doc: "https://support.google.com/analytics" },
    { name: "Email Marketing", category: "Marketing/Sales", aliases: ["email marketing"], doc: null },
    { name: "Salesforce", category: "Marketing/Sales", aliases: ["salesforce", "crm"], doc: "https://help.salesforce.com/" },
    { name: "Paid Advertising", category: "Marketing/Sales", aliases: ["paid ads", "ppc", "google ads", "meta ads"], doc: null },
    { name: "Social Media Marketing", category: "Marketing/Sales", aliases: ["social media marketing", "social media management"], doc: null },
    { name: "Negotiation", category: "Marketing/Sales", aliases: ["negotiation"], doc: null },

    // --- Soft skills ---
    { name: "Communication", category: "Soft Skills", aliases: ["communication skills", "verbal communication", "written communication", "communication"], doc: null },
    { name: "Leadership", category: "Soft Skills", aliases: ["leadership"], doc: null },
    { name: "Problem Solving", category: "Soft Skills", aliases: ["problem solving", "problem-solving"], doc: null },
    { name: "Critical Thinking", category: "Soft Skills", aliases: ["critical thinking"], doc: null },
    { name: "Time Management", category: "Soft Skills", aliases: ["time management"], doc: null },
    { name: "Adaptability", category: "Soft Skills", aliases: ["adaptability", "flexibility"], doc: null },
    { name: "Teamwork", category: "Soft Skills", aliases: ["teamwork", "collaboration"], doc: null },
    { name: "Mentoring", category: "Soft Skills", aliases: ["mentoring", "coaching"], doc: null },
    { name: "Presentation Skills", category: "Soft Skills", aliases: ["presentation skills", "public speaking"], doc: null },
  ];

  // Fallback learning-resource generator for any skill (curated doc + generic search links)
  function resourcesForSkill(skill) {
    const q = encodeURIComponent(skill.name);
    const links = [];
    if (skill.doc) links.push({ title: `${skill.name} — official docs`, url: skill.doc });
    links.push({ title: `${skill.name} tutorial (YouTube)`, url: `https://www.youtube.com/results?search_query=${q}+tutorial` });
    links.push({ title: `${skill.name} on freeCodeCamp`, url: `https://www.freecodecamp.org/news/search/?query=${q}` });
    links.push({ title: `${skill.name} courses (Coursera)`, url: `https://www.coursera.org/search?query=${q}` });
    return links;
  }

  global.GapNinja = global.GapNinja || {};
  global.GapNinja.SkillsData = { SKILLS, resourcesForSkill };
})(window);
