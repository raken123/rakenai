--[[
	HotDogData
	Shared catalogue of every hot dog in the game.

	Income is paid out once per second for every hot dog standing on your base,
	including the ones you stole from somebody else.

	DevProductId: create a Developer Product in Studio for each paid hot dog
	(Game Settings -> Monetization -> Developer Products) and paste the id here.
	A DevProductId of 0 simply disables the Robux button for that hot dog.
--]]

local HotDogData = {}

HotDogData.List = {
	{
		Id = "hot_dog",
		Name = "Hot Dog",
		Rarity = "Common",
		Price = 20,
		Income = 3,
		Robux = 0,
		DevProductId = 0,
		StealSeconds = 3,
		BunColor = Color3.fromRGB(226, 178, 102),
		BunMaterial = Enum.Material.SmoothPlastic,
		SausageColor = Color3.fromRGB(176, 76, 48),
		SausageMaterial = Enum.Material.SmoothPlastic,
	},
	{
		Id = "goblin_hot_dog",
		Name = "Goblin Hot Dog",
		Rarity = "Uncommon",
		Price = 120,
		Income = 50,
		Robux = 50,
		DevProductId = 0,
		StealSeconds = 4,
		BunColor = Color3.fromRGB(135, 168, 96),
		BunMaterial = Enum.Material.SmoothPlastic,
		SausageColor = Color3.fromRGB(86, 168, 60),
		SausageMaterial = Enum.Material.Slate,
	},
	{
		Id = "needoh_hot_dog",
		Name = "Needoh Hot Dog",
		Rarity = "Rare",
		Price = 700,
		Income = 90,
		Robux = 100,
		DevProductId = 0,
		StealSeconds = 5,
		BunColor = Color3.fromRGB(255, 214, 160),
		BunMaterial = Enum.Material.SmoothPlastic,
		SausageColor = Color3.fromRGB(255, 140, 170),
		SausageMaterial = Enum.Material.Neon,
	},
	{
		Id = "hacked_hot_dog",
		Name = "Hacked Hot Dog",
		Rarity = "Epic",
		Price = 1200,
		Income = 300,
		Robux = 600,
		DevProductId = 0,
		StealSeconds = 6,
		BunColor = Color3.fromRGB(38, 40, 48),
		BunMaterial = Enum.Material.Metal,
		SausageColor = Color3.fromRGB(60, 255, 120),
		SausageMaterial = Enum.Material.Neon,
	},
	{
		Id = "human_hot_dog",
		Name = "Human Hot Dog",
		Rarity = "Epic",
		Price = 4900,
		Income = 1000,
		Robux = 1000,
		StealSeconds = 7,
		DevProductId = 0,
		BunColor = Color3.fromRGB(200, 150, 120),
		BunMaterial = Enum.Material.SmoothPlastic,
		SausageColor = Color3.fromRGB(235, 186, 152),
		SausageMaterial = Enum.Material.SmoothPlastic,
	},
	{
		Id = "strawberry_hot_dog",
		Name = "Strawberry Hot Dog",
		Rarity = "Legendary",
		Price = 79000,
		Income = 5000,
		Robux = 5000,
		DevProductId = 0,
		StealSeconds = 8,
		BunColor = Color3.fromRGB(255, 170, 190),
		BunMaterial = Enum.Material.SmoothPlastic,
		SausageColor = Color3.fromRGB(220, 40, 70),
		SausageMaterial = Enum.Material.Neon,
	},
	{
		Id = "inverted_hot_dog",
		Name = "Inverted Hot Dog",
		Rarity = "Mythic",
		Price = 690000,
		Income = 19000,
		Robux = 10000,
		DevProductId = 0,
		StealSeconds = 10,
		BunColor = Color3.fromRGB(29, 77, 153),
		BunMaterial = Enum.Material.Glass,
		SausageColor = Color3.fromRGB(79, 179, 207),
		SausageMaterial = Enum.Material.Neon,
	},
	{
		Id = "silver_hot_dog",
		Name = "Silver Hot Dog",
		Rarity = "Godly",
		Price = 6000000,
		Income = 100000,
		Robux = 50000,
		DevProductId = 0,
		StealSeconds = 12,
		BunColor = Color3.fromRGB(168, 172, 184),
		BunMaterial = Enum.Material.Metal,
		SausageColor = Color3.fromRGB(226, 230, 240),
		SausageMaterial = Enum.Material.Metal,
	},
}

HotDogData.RarityColor = {
	Common = Color3.fromRGB(190, 196, 208),
	Uncommon = Color3.fromRGB(118, 214, 118),
	Rare = Color3.fromRGB(88, 170, 255),
	Epic = Color3.fromRGB(190, 118, 255),
	Legendary = Color3.fromRGB(255, 176, 60),
	Mythic = Color3.fromRGB(255, 96, 160),
	Godly = Color3.fromRGB(240, 240, 255),
}

HotDogData.ById = {}
HotDogData.ByProduct = {}

for index, info in ipairs(HotDogData.List) do
	info.Index = index
	HotDogData.ById[info.Id] = info
	if info.DevProductId ~= 0 then
		HotDogData.ByProduct[info.DevProductId] = info
	end
end

-- Selling a hot dog refunds this share of its cash price.
HotDogData.SellRate = 0.5

function HotDogData.SellValue(info)
	return math.max(1, math.floor(info.Price * HotDogData.SellRate))
end

local SUFFIXES = { "", "K", "M", "B", "T", "Qa", "Qi", "Sx" }

-- 1234567 -> "1.2M"
function HotDogData.Abbreviate(amount)
	local value = math.floor(tonumber(amount) or 0)
	local sign = value < 0 and "-" or ""
	value = math.abs(value)

	local step = 1
	while value >= 1000 and step < #SUFFIXES do
		value = value / 1000
		step += 1
	end

	if step == 1 then
		return sign .. string.format("%d", value)
	end

	local text = string.format("%.1f", value)
	text = (string.gsub(text, "%.0$", ""))
	return sign .. text .. SUFFIXES[step]
end

-- 1234567 -> "1,234,567"
function HotDogData.Comma(amount)
	local text = string.format("%d", math.floor(tonumber(amount) or 0))
	local sign = ""
	if string.sub(text, 1, 1) == "-" then
		sign = "-"
		text = string.sub(text, 2)
	end

	local grouped = text
	while true do
		local replaced
		grouped, replaced = string.gsub(grouped, "^(%d+)(%d%d%d)", "%1,%2")
		if replaced == 0 then
			break
		end
	end

	return sign .. grouped
end

return HotDogData
