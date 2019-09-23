module.exports = async msg => {
	if (!client.done) return;
	if (msg.author.blacklisted || (msg.guild && await msg.guild.blacklisted)) return;
	if (!msg.author.loadedPerms) await msg.author.setPerms();
	if (msg.author.bot || (config.devOnlyMode && !msg.author.maintainer)) return;

	// Fix messages
	msg.content = msg.content.replace(/^[\n‌]+$/igm, "").replace(/\s{5,}/m, "     ").replace(/^ +| +$/, "");
	const prefix = msg.content.startsWith(client.user) ? `${client.user} ` : msg.content.startsWith(config.prefix) ? config.prefix : await msg.author.prefix;

	// Check for call
	let call = await msg.channel.call;
	if (!call && !msg.content.startsWith(prefix)) return;

	// Filter out the command and arguments to pass
	let cmd = msg.content.split(" ")[0].trim().toLowerCase().replace(prefix, "")
		.replace(/dial/g, "call");
	if (config.aliasCommands[cmd]) cmd = config.aliasCommands[cmd];
	const suffix = msg.content.split(" ").splice(1)
		.join(" ")
		.trim();

	if (msg.channel.number === undefined) msg.channel.number = await r.table("Numbers").getAll(msg.channel.id, { index: "channel" }).nth(0).default(null);

	// Find the command file
	let cmdFile;
	if (call && !msg.content.startsWith(prefix)) {
		return (await reload("./Internals/callHandler.js"))(cmd, msg, suffix, call);
	} else if (call && msg.content.startsWith(prefix)) {
		cmdFile = await reload(`./Commands/Call/${cmd}`);
	}
	if (!cmdFile && (call && !call.hold)) return;

	// check busy first since it's a simple return
	if (msg.author.busy && !call && !msg.author.maintainer) return;

	// Find Maintainer or Support commands
	if (!cmdFile) cmdFile = await reload(`./Commands/Public/${cmd}`);
	if (msg.author.maintainer && !cmdFile) cmdFile = await reload(`./Commands/Private/${cmd}`);
	if (msg.author.support && !cmdFile) cmdFile = await reload(`./Commands/Support/${cmd}`);
	if (!cmdFile) return;

	// Check cooldown now because it sends an embed
	let cooldown = await r.table("Cooldowns").get(`${msg.author.id}-default`);
	if (cooldown && cooldown.time > Date.now() && !msg.author.support) return msg.channel.send({ embed: { color: config.colors.error, title: "Cooldown", description: `You're under cooldown for another ${Math.round((cooldown.time - Date.now()) / 1000, 1)}s` } });
	// Add cooldown
	if (!msg.author.support && !msg.author.donator) msg.author.cooldown = "default";
	// Run the command
	if (cmdFile) {
		if (cmd !== "eval") winston.info(`[${cmd}] ${msg.author.tag}(${msg.author.id}) => ${msg.content}`);
		try {
			await cmdFile(client, msg, suffix, call);
		} catch (err) {
			msg.channel.send({
				embed: {
					color: config.colors.error,
					title: "❌ Error!",
					description: `An unexpected error has occured.\n\`\`\`js\n${err.stack}\`\`\``,
					footer: {
						text: `Please contact a maintainer: ${config.guildInvite}.`,
					},
				},
			});
		}
	}
};
