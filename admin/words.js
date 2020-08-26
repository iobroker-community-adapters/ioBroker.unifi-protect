/*global systemDictionary:true */
"use strict";

const dictionary = {
	"unifi-protect adapter settings": {
		"en": "Adapter settings for unifi-protect",
		"de": "Adaptereinstellungen für unifi-protect",
		"ru": "Настройки адаптера для unifi-protect",
		"pt": "Configurações do adaptador para unifi-protect",
		"nl": "Adapterinstellingen voor unifi-protect",
		"fr": "Paramètres d'adaptateur pour unifi-protect",
		"it": "Impostazioni dell'adattatore per unifi-protect",
		"es": "Ajustes del adaptador para unifi-protect",
		"pl": "Ustawienia adaptera dla unifi-protect",
		"zh-cn": "unifi-protect的适配器设置"
	},
	"get all your data from your cameras": {
		"en": "get all your data from your cameras",
		"de": "Holt alle Daten von Deinen Kameras",
		"ru": "получить все свои данные с ваших камер",
		"pt": "obtenha todos os seus dados de suas câmeras",
		"nl": "haal al uw gegevens van uw camera's",
		"fr": "récupérez toutes vos données de vos caméras",
		"it": "ottenere tutti i dati dalle telecamere",
		"es": "obtén todos tus datos de tus cámaras",
		"pl": "uzyskać wszystkie dane z kamer",
		"zh-cn": "从相机获取所有数据"
	},
	"IP Address / Hostname": {
		"en": "IP Address / Hostname",
		"de": "IP-Adresse / Hostname",
		"ru": "IP-адрес / имя хоста",
		"pt": "Endereço IP / Nome do host",
		"nl": "IP-adres / hostnaam",
		"fr": "Adresse IP / nom d'hôte",
		"it": "Indirizzo IP / nome host",
		"es": "Dirección IP / Nombre de host",
		"pl": "Adres IP / nazwa hosta",
		"zh-cn": "IP地址/主机名"
	},
	"Username": {
		"en": "Username",
		"de": "Benutzername",
		"ru": "Имя пользователя",
		"pt": "Nome do usuário",
		"nl": "Gebruikersnaam",
		"fr": "Nom d'utilisateur",
		"it": "Nome utente",
		"es": "Nombre de usuario",
		"pl": "Nazwa Użytkownika",
		"zh-cn": "用户名"
	},
	"Password": {
		"en": "Password",
		"de": "Passwort",
		"ru": "пароль",
		"pt": "Senha",
		"nl": "Wachtwoord",
		"fr": "Mot de passe",
		"it": "Parola d'ordine",
		"es": "Contraseña",
		"pl": "Hasło",
		"zh-cn": "密码"
	},
	"Refresh Interval": {
		"en": "Refresh Interval",
		"de": "Aktualisierungsintervall",
		"ru": "Интервал обновления",
		"pt": "Intervalo de atualização",
		"nl": "Vernieuwingsinterval",
		"fr": "Intervalle de rafraîchissement",
		"it": "Intervallo di aggiornamento",
		"es": "Intervalo de actualización",
		"pl": "Częstotliwość odświeżania",
		"zh-cn": "刷新间隔"
	},
	"Get Motions (last Motion is always included)": {
		"en": "Get Motions (last Motion is always included)",
		"de": "Bewegungen abrufen (letzte Bewegung ist immer enthalten)",
		"ru": "Получить движения (всегда включается последнее движение)",
		"pt": "Obter movimentos (o último movimento está sempre incluído)",
		"nl": "Get Motions (laatste beweging is altijd inbegrepen)",
		"fr": "Obtenir des motions (la dernière motion est toujours incluse)",
		"it": "Ottieni movimenti (l'ultimo movimento è sempre incluso)",
		"es": "Obtener movimientos (el último movimiento siempre está incluido)",
		"pl": "Pobierz ruchy (ostatni ruch jest zawsze uwzględniany)",
		"zh-cn": "取得动作（总是包含最后动作）"
	},
	"Number of Motions": {
		"en": "Number of Motions",
		"de": "Anzahl der Bewegungen",
		"ru": "Количество движений",
		"pt": "Número de moções",
		"nl": "Aantal bewegingen",
		"fr": "Nombre de motions",
		"it": "Numero di movimenti",
		"es": "Número de mociones",
		"pl": "Liczba ruchów",
		"zh-cn": "动作数"
	},
	"Last x Seconds of Motions": {
		"en": "Last x Seconds of Motions",
		"de": "Letzte x Sekunden der Bewegungen",
		"ru": "Последние x секунд движения",
		"pt": "Últimos x segundos de movimentos",
		"nl": "Laatste x seconden van bewegingen",
		"fr": "Dernières x secondes de motions",
		"it": "Ultimi x secondi di movimenti",
		"es": "Últimos x segundos de movimientos",
		"pl": "Ostatnie x sekund ruchu",
		"zh-cn": "最后x秒的动作"
	},
	"general": {
		"en": "general",
		"de": "Allgemeines",
		"ru": "Общее",
		"pt": "geral",
		"nl": "algemeen",
		"fr": "général",
		"it": "generale",
		"es": "general",
		"pl": "generał",
		"zh-cn": "一般"
	},
	"cameras": {
		"en": "cameras",
		"de": "Kameras",
		"ru": "камеры",
		"pt": "máquinas fotográficas",
		"nl": "camera's",
		"fr": "appareils photo",
		"it": "macchine fotografiche",
		"es": "cámaras",
		"pl": "kamery",
		"zh-cn": "摄影机"
	},
	"motions": {
		"en": "motions",
		"de": "Bewegungen",
		"ru": "движения",
		"pt": "movimentos",
		"nl": "bewegingen",
		"fr": "mouvements",
		"it": "moti",
		"es": "mociones",
		"pl": "ruchy",
		"zh-cn": "动作"
	},
	"root_motions": {
		"en": "motions datapoints",
		"de": "Bewegungsdatenpunkte",
		"ru": "точки данных",
		"pt": "pontos de dados de movimentos",
		"nl": "motions datapunten",
		"fr": "points de données de mouvements",
		"it": "datapoint dei movimenti",
		"es": "puntos de datos de movimientos",
		"pl": "punkty danych ruchu",
		"zh-cn": "运动数据点"
	}

};

try {
	// @ts-ignore
	systemDictionary = dictionary;
} catch (ignore) { }

try {
	module.exports = dictionary;
} catch (ignore) { }