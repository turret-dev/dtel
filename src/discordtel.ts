import { readdir } from "fs-nextra"
const clear = require("clear-module");
import { createLogger, format, transports, Logger } from "winston";
const DailyRotateFile = require("winston-daily-rotate-file");
import { BaseCluster } from "kurasuta";
import * as config from "./configuration/config.js";

module.exports = class extends BaseCluster {
	public async launch(): Promise<void> {
		await require("./Database/init")()
			.then(() => winston.info("[Database] Successfully connected to the database."))
			.catch((err: object) => winston.error(`[Database] An error occured while initializing the database.\n${err}`));

		let events = await readdir("./Events");
		for (let e of events) {
			let name = e.replace(".js", "");
			this.client.on(name, async(...args: any[]) => (await reload(`./Events/${e}`))(...args));
		}

		const winston: Logger = createLogger({
			level: "info",
			transports: [
				new transports.Console({
					format: format.colorize(),
				}),
				new DailyRotateFile({
					filename: `./Logs/Winston-Log-%DATE%-Shard${this.client.shard!.id}.log`,
					datePattern: "YYY-MM-DD-HH",
					zippedArchive: true,
					maxFiles: "100d",
					maxSize: "20m",
				}),
			],
			exitOnError: false,
			format: format.combine(
				format.colorize(),
				format.timestamp(),
				format.printf((info: any) => `${info.level}: [Shard ${this.client.shard!.id}] ${info.message} [${info.timestamp}]`)
				// format.simple(),
			),
		});

		const reload = async(path: string) : Promise<any> => {
			clear(path);
			try {
				let file : any = require(path);
				if (!file) return null;
				return file;
			} catch (err) {
				return null;
			}
		};

		this.client.on("disconnect", () => this.client.login());

		// Scheduled jobs
		require("./Internals/jobs.js");

		if (config.devMode) process.on("unhandledRejection", (e: any) => winston.error(e));

		this.client.login(require("./Configuration/auth.js").discord.token).catch(() => {
			let interval = setInterval(() => {
				this.client.login(require("./Configuration/auth.js").discord.token)
					.then(() => {
						clearInterval(interval);
					})
					.catch(() => {
						winston.info("[Discord] Failed to connect. Retrying in 5 minutes...");
					});
			}, 300000);
		});
	}
};
