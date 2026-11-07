// Spanish translation of the Learn guide (prose and narration; demos stay in English).
export default {
  name: 'Español', locale: 'es_ES', dir: 'ltr',
  ui: {
    title: 'Cómo funciona la IA: tokens, contexto, agentes y MCP',
    description: 'Una guía interactiva y en lenguaje sencillo sobre cómo funcionan los modelos de IA: tokens, ventana de contexto, caché, agentes, MCP, RAG, entrenamiento, cuantización y cómo ejecutar modelos en casa, con audio narrado en español.',
    ogSub: 'Tokens, contexto, agentes, MCP y más',
    eyebrow: 'Aprender', h1: ['Cómo funciona', 'de verdad', 'la IA'],
    lede: (n) => `Una guía en lenguaje sencillo sobre las palabras que ves en cada página de modelos — tokens, ventanas de contexto, caché, agentes, MCP, mezcla de expertos — con una demo práctica en cada capítulo y ejemplos reales de los ${n} modelos que seguimos.`,
    listenAll: 'Escuchar toda la guía',
    meta: (c, m) => `${c} capítulos · unos ${m} minutos · audio narrado`,
    toc: 'En esta página', listen: 'Escuchar', min: 'min',
    deep: 'Profundizar', deepNote: 'notas técnicas en inglés',
    demoNote: 'Las demos interactivas y las notas técnicas están en inglés.',
    source: 'Ejemplos calculados a partir del catálogo público de modelos y proveedores. Narración con voz de Magnific.',
    localCta: 'Comprueba qué puede ejecutar tu ordenador →',
  },
  ch: {
    what: { t: '¿Qué es la IA?', h: ['¿Qué es la', 'IA?'], p: [
      'La <strong>inteligencia artificial</strong> es software que aprende patrones a partir de ejemplos en lugar de seguir reglas escritas a mano. Un filtro de spam que ha visto millones de correos aprende cómo es el spam; nadie escribe cada regla.',
      'La IA de las herramientas de programación es un <strong>modelo de lenguaje grande</strong>, o LLM. Se entrenó leyendo una enorme cantidad de texto y código — libros, webs, documentación, repositorios de código abierto — y ajustando miles de millones de números internos, llamados <strong>parámetros</strong>, hasta volverse muy bueno en una sola tarea: adivinar qué texto viene a continuación.',
      'Parece poca cosa, pero para adivinar bien la siguiente línea de un programa, un modelo tiene que aprender gramática, hechos, las reglas de los lenguajes de programación y una idea práctica de cómo se resuelven los problemas. Todo lo que hace — responder preguntas, escribir código, corregir errores — se basa en esa única habilidad.',
    ] },
    how: { t: 'Cómo responde un modelo', h: ['Cómo responde', 'un modelo'], p: [
      'Construir un modelo tiene dos etapas. El <strong>entrenamiento</strong> es la parte cara: miles de chips trabajan durante semanas mientras el modelo lee sus datos y se ajustan sus parámetros. Después, el modelo queda congelado. La <strong>inferencia</strong> es lo que ocurre cuando lo usas: entra tu texto y el modelo produce una respuesta pieza a pieza.',
      'En cada paso, el modelo mira todo lo escrito hasta ahora y asigna una probabilidad a cada posible siguiente pieza. Se elige una, se añade al texto y todo se repite hasta terminar la respuesta. Por eso las respuestas aparecen en pantalla palabra a palabra.',
      'Un ajuste llamado <strong>temperatura</strong> controla lo atrevida que es esa elección. Con temperatura baja casi siempre gana la opción más probable, lo que conviene para el código. Con temperatura alta pasan palabras menos probables, lo que conviene para generar ideas.',
    ] },
    tokens: { t: 'Tokens', h: ['¿Qué son los', 'tokens?'], p: [
      'Los modelos no leen letras ni palabras enteras. Leen <strong>tokens</strong>: trozos de texto que suelen ser una palabra, parte de una palabra o un símbolo. Las palabras comunes son un solo token; una palabra rara puede dividirse en dos o tres. En inglés, un token equivale a unos cuatro caracteres; en español suele hacer falta algo más de tokens para el mismo texto. El código usa más tokens por línea por sus símbolos y sangrías.',
      'Los tokens importan porque son la unidad con la que se <strong>mide y se cobra</strong> a los modelos. Los precios se dan por millón de tokens, con un precio para lo que envías (entrada) y otro para lo que el modelo escribe (salida). La salida suele ser varias veces más cara.',
    ] },
    context: { t: 'Ventana de contexto', h: ['La ventana de', 'contexto'], p: [
      'La <strong>ventana de contexto</strong> es cuánto texto puede mirar un modelo de una vez: tus instrucciones, la conversación hasta ahora, los archivos que ha abierto un agente y la respuesta que está escribiendo. Es la memoria de trabajo del modelo. Lo que queda fuera, sencillamente no existe para él.',
      'El contexto se mide en tokens. Un modelo con una ventana de un millón de tokens puede abarcar unas 750.000 palabras a la vez: unas diez novelas o un proyecto de código mediano. Un modelo no recuerda tus chats anteriores por sí mismo; las herramientas le dan memoria volviendo a poner texto antiguo en la ventana. Cuando la ventana se llena, lo más antiguo se elimina o se resume.',
    ] },
    prompts: { t: 'Prompts de sistema', h: ['Prompts y', 'prompts de sistema'], p: [
      'Todo lo que escribes es un <strong>prompt</strong>. Pero antes de que llegue tu mensaje, la aplicación ya ha enviado al modelo sus propias instrucciones ocultas: el <strong>prompt de sistema</strong>. Define quién es el modelo, qué herramientas puede usar, en qué estilo escribir y qué no debe hacer nunca. Los agentes de programación envían prompts de sistema largos, que explican cómo editar archivos, cuándo ejecutar pruebas y cuándo pedir permiso.',
      'Por eso el mismo modelo puede parecer totalmente distinto en dos herramientas: mismo cerebro, distintas instrucciones. Los buenos prompts son concretos: di qué quieres, da el contexto que el modelo no puede adivinar, muestra un ejemplo del resultado y explica qué significa «terminado».',
    ] },
    cache: { t: 'Aciertos de caché', h: ['¿Qué es un', 'acierto de caché?'], p: [
      'Un agente de programación envía al modelo el mismo gran bloque de texto una y otra vez: las instrucciones del sistema, los archivos del proyecto y la conversación. Solo cambian las últimas líneas en cada turno. Procesarlo todo desde cero cada vez sería lento y caro.',
      'La <strong>caché de prompts</strong> lo resuelve. El proveedor guarda el trabajo hecho sobre el comienzo de tu petición. Si la siguiente petición empieza exactamente con el mismo texto, reutiliza ese trabajo. Eso es un <strong>acierto de caché</strong>, y esos tokens se cobran con un gran descuento. Si cambia un solo carácter cerca del principio, todo lo que sigue es un <strong>fallo de caché</strong> y se cobra a precio completo.',
      'Las cachés duran poco — a menudo minutos —, así que ayudan sobre todo en sesiones intensas. El resultado es el mismo trabajo, mucho más barato y más rápido; por eso las herramientas se esfuerzan en mantener idéntico el comienzo de cada petición.',
    ] },
    reasoning: { t: 'Tokens de razonamiento', h: ['Tokens de', 'razonamiento'], p: [
      'Algunos modelos pueden <strong>pensar antes de responder</strong>. En lugar de contestar enseguida, primero escriben una cadena de razonamiento privada: descomponen el problema, prueban un enfoque, lo comprueban y corrigen errores. Solo entonces escriben la respuesta final.',
      'Así son mucho mejores en problemas difíciles, como errores complicados, matemáticas o planificar un cambio grande. El inconveniente es que el pensamiento también está hecho de tokens. <strong>Los tokens de razonamiento se cobran como salida</strong>, aunque nunca los veas. Muchas herramientas te dejan elegir el nivel de esfuerzo, de bajo a alto.',
    ] },
    tools: { t: 'Herramientas y agentes', h: ['Herramientas y', 'agentes'], p: [
      'Por sí solo, un modelo solo puede escribir texto. Las <strong>llamadas a herramientas</strong> lo cambian. La aplicación le dice qué herramientas existen — leer un archivo, ejecutar un comando, buscar en la web — y cuando el modelo necesita una, escribe una petición estructurada en lugar de una respuesta normal. La aplicación ejecuta la herramienta de verdad y le devuelve el resultado. El modelo lo lee y decide qué hacer después.',
      'Pon eso en un bucle y tienes un <strong>agente</strong>: leer la prueba que falla, abrir el archivo, hacer un cambio, volver a ejecutar las pruebas, repetir hasta que pasen. Todos los agentes de programación de este sitio son, en el fondo, ese bucle.',
    ] },
    mcp: { t: 'MCP', h: ['MCP, el', 'Model Context Protocol'], p: [
      'Cada herramienta que usa un modelo tiene que conectarla alguien. Antes de MCP, cada aplicación conectaba cada servicio a su manera. El <strong>Model Context Protocol</strong> es un estándar común para esa conexión: piensa en él como el USB-C de las herramientas de IA.',
      'Un <strong>servidor MCP</strong> envuelve un servicio — GitHub, una base de datos, un navegador, tus archivos de diseño — y describe las herramientas que ofrece. Cualquier aplicación que hable MCP puede conectarlo y el modelo puede usar esas herramientas de inmediato. Escribes el servidor una vez y funciona en todas partes; por eso aparecieron tantos tan rápido.',
    ] },
    utcp: { t: 'UTCP', h: ['UTCP, el', 'Universal Tool Calling Protocol'], p: [
      'MCP pone un servidor entre el modelo y el servicio. El <strong>Universal Tool Calling Protocol</strong> parte de otra pregunta: si un servicio ya tiene una API, ¿por qué envolverlo en otro servidor? UTCP es un estándar abierto que permite al agente llamar a la herramienta directamente.',
      'Cada herramienta publica un <strong>manual</strong>: un archivo JSON que indica qué hace cada herramienta, qué datos recibe y cómo llamarla. El agente lee el manual una vez y después habla con el servicio por su propio protocolo, como HTTP o la línea de comandos, con el inicio de sesión del propio servicio.',
      'La pega es que el trabajo cambia de sitio, no desaparece. El cliente del agente tiene que hablar cada protocolo y gestionar inicios de sesión, reintentos y errores, y cada herramienta es responsable de su propia seguridad. MCP además tiene muchos más servidores y apoyo de empresas.',
      'No hace falta elegir para siempre: UTCP tiene un complemento para llamar a servidores MCP existentes.',
    ] },
    embeddings: { t: 'Embeddings y RAG', h: ['Embeddings y', 'RAG'], p: [
      'Los ordenadores no pueden comparar significados directamente, así que los modelos convierten el texto en listas de números llamadas <strong>embeddings</strong>. Cada una es un punto en un espacio de cientos de dimensiones, y los textos con significados parecidos quedan cerca: «arregla el fallo de inicio de sesión» queda junto a «error de autenticación», aunque no compartan palabras.',
      'Eso permite buscar por significado: conviertes cada documento una vez, conviertes cada pregunta y tomas los documentos más cercanos. La <strong>generación aumentada por recuperación</strong>, o RAG, mete esos documentos en la ventana de contexto antes de que el modelo responda. Así un modelo puede contestar sobre tu código sin haberse entrenado con él.',
    ] },
    hallucinations: { t: 'Alucinaciones', h: ['Por qué los modelos', 'alucinan'], p: [
      'El trabajo de un modelo es producir texto <em>probable</em>, no texto <em>verdadero</em>. Normalmente coinciden; cuando no, puede afirmar algo falso con total seguridad. Eso es una <strong>alucinación</strong>.',
      'En el código aparecen como una función que no existe, una opción de configuración que nunca se añadió o un nombre de paquete que suena perfecto. Son más frecuentes con bibliotecas poco conocidas, cambios recientes y detalles exactos. Las defensas: dar al modelo la fuente real (documentación, archivos, búsqueda), dejarle ejecutar el código y las pruebas, y comprobar todo lo importante.',
    ] },
    training: { t: 'Cómo se entrenan', h: ['Cómo se entrenan', 'los modelos'], p: [
      'Un modelo se construye por etapas. Primero viene el <strong>preentrenamiento</strong>: lee billones de tokens y aprende a predecir el siguiente. De ahí sale su conocimiento, y es con diferencia el paso más caro, pero el resultado todavía no es un asistente útil.',
      'Después, el <strong>ajuste fino</strong> con ejemplos de buenas conversaciones le enseña a seguir instrucciones. Por último, el <strong>aprendizaje por refuerzo</strong>: intenta tareas, sus respuestas se puntúan — por personas, por otros modelos o con comprobaciones automáticas como si el código pasa sus pruebas — y se premian las buenas. Ese último paso explica en gran parte lo rápido que han mejorado los modelos de programación.',
    ] },
    moe: { t: 'Mezcla de expertos', h: ['Mezcla de', 'expertos'], p: [
      'Un modelo normal, o <strong>denso</strong>, usa todos sus parámetros para cada token. Un modelo de <strong>mezcla de expertos</strong> (MoE) se divide en muchas subredes más pequeñas llamadas expertos. Para cada token, un pequeño <strong>enrutador</strong> elige solo unos pocos expertos y el resto descansa.',
      'Resultado: el modelo guarda el conocimiento de una red enorme, pero cada token cuesta como uno pequeño. Por eso se indican por separado los parámetros totales y los <strong>activos</strong>. El tamaño total decide cuánta memoria hace falta para alojarlo; el tamaño activo decide lo rápido y barato que es cada token.',
    ] },
    quant: { t: 'Cuantización', h: ['Cuantización', '(fp8, fp4)'], p: [
      'Cada parámetro es un número, y los números se pueden guardar con más o menos precisión. La <strong>cuantización</strong> los guarda con menos bits — por ejemplo 8 bits (fp8) o 4 bits (fp4) en lugar de 16. El modelo ocupa menos y es más rápido y normalmente más barato de servir, a cambio de una pequeña pérdida de calidad, a veces apreciable.',
      'Por eso el mismo modelo abierto puede costar distinto según el proveedor: quizá ejecutan precisiones distintas en hardware distinto.',
    ] },
    weights: { t: 'Pesos abiertos y cerrados', h: ['Pesos abiertos', 'y cerrados'], p: [
      'Los <strong>pesos</strong> de un modelo son sus parámetros aprendidos: el archivo que <em>es</em> el modelo. Los modelos <strong>cerrados</strong> los mantienen privados: solo puedes usarlos mediante la aplicación o la API del laboratorio. Los modelos de <strong>pesos abiertos</strong> los publican, así que cualquiera puede descargarlos, ejecutarlos, ajustarlos o revender el acceso.',
      'Los modelos cerrados suelen haber ido por delante en capacidad bruta. Los abiertos te dan elección: muchos proveedores compitiendo en precio y velocidad, datos que se quedan en tus máquinas y un modelo que sigue funcionando aunque su creador cambie de rumbo.',
    ] },
    local: { t: 'IA en casa', h: ['Ejecutar la IA', 'en casa'], p: [
      'Los modelos de pesos abiertos pueden funcionar en tu propio ordenador. Un programa llamado <strong>runtime</strong> — Ollama, LM Studio o llama.cpp — carga los pesos del modelo en memoria, idealmente en la memoria de tu tarjeta gráfica (VRAM), y genera texto igual que lo haría un proveedor en la nube. Nada sale de tu máquina, no pagas por token y funciona sin conexión.',
      'Dos números deciden qué puedes ejecutar. La <strong>memoria</strong> decide qué modelos caben: aproximadamente parámetros × bits por peso ÷ 8, más espacio para el contexto. Un modelo de 8.000 millones de parámetros a 4 bits necesita unos 5 GB; uno de 70.000 millones, más de 40 GB. El <strong>ancho de banda de memoria</strong> decide la velocidad, porque cada token nuevo obliga a leer de nuevo todos los pesos activos; por eso los modelos de mezcla de expertos, con pocos parámetros activos, son tan populares en casa.',
      'Abre la <a href="{root}local/">calculadora</a>: detecta tu hardware, te dice qué modelos funcionarán y a qué velocidad, qué ajustes o mejoras te ayudarían y los comandos exactos para instalarlos.',
    ] },
    multimodal: { t: 'Multimodal', h: ['Modelos', 'multimodales'], p: [
      'Los primeros modelos de lenguaje solo manejaban texto. Los modelos <strong>multimodales</strong> también aceptan imágenes, PDF, audio e incluso vídeo. Para programar es sorprendentemente útil: pega una captura de un diseño roto o una maqueta y pide al modelo que la construya, o deja que un agente haga capturas de la aplicación para revisar su propio trabajo.',
      'Por dentro, una imagen también se convierte en tokens. Se corta en pequeños parches y cada parche se convierte más o menos en un token; así, una imagen grande puede ocupar tanto contexto como una página de texto.',
    ] },
    speed: { t: 'Velocidad', h: ['Velocidad: latencia y', 'rendimiento'], p: [
      'Dos números deciden lo rápido que se siente un modelo. La <strong>latencia</strong>, o tiempo hasta el primer token, es cuánto esperas antes de que aparezca algo. El <strong>rendimiento</strong>, en tokens por segundo, es lo rápido que fluye el texto una vez empieza. Para una pregunta rápida importa más la latencia; para un agente que escribe un archivo grande, el rendimiento.',
      'La velocidad depende del tamaño del modelo, de lo ocupado que esté y del hardware y software de quien lo sirve. Los modelos de razonamiento además pasan un tiempo pensando antes de que empiece la respuesta visible.',
    ] },
    benchmarks: { t: 'Benchmarks', h: ['Cómo leer los', 'benchmarks'], p: [
      'Un <strong>benchmark</strong> es una prueba estándar: las mismas tareas para todos los modelos, para poder comparar puntuaciones. Algunos miden conocimiento y razonamiento con preguntas difíciles tipo examen; los de programación dan al modelo errores reales de proyectos reales y comprueban si su arreglo hace pasar las pruebas.',
      'Léelos con cuidado. Un modelo puede haber visto las preguntas durante el entrenamiento, lo que infla su nota; los laboratorios eligen qué resultados mostrar; y una buena nota en un tipo de tarea dice poco de otra. El mejor benchmark es tu propio trabajo: prueba varios modelos en lo que haces de verdad.',
    ] },
  },
};
