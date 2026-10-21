--[[
	Steal a Hot Dog - server entry point.

	Buy hot dogs, stand them on your base, collect cash every second,
	and raid everybody else's base for theirs.
--]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local MarketplaceService = game:GetService("MarketplaceService")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local HotDogData = require(ReplicatedStorage:WaitForChild("HotDogData"))
local Modules = ServerScriptService:WaitForChild("Modules")
local Plots = require(Modules:WaitForChild("Plots"))
local HotDogs = require(Modules:WaitForChild("HotDogs"))

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local BuyHotDog = Remotes:WaitForChild("BuyHotDog")
local Notify = Remotes:WaitForChild("Notify")

local STARTING_CASH = 25
local BUY_COOLDOWN = 0.25

local lastBuy = {}
local store = nil

do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore("StealAHotDog_v1")
	end)
	if ok then
		store = result
	else
		warn("[Steal a Hot Dog] DataStore unavailable, progress will not save: " .. tostring(result))
	end
end

local function notify(player, message, kind)
	Notify:FireClient(player, message, kind or "info")
end

HotDogs.Notify = notify

local function cashValue(player)
	local stats = player:FindFirstChild("leaderstats")
	return stats and stats:FindFirstChild("Cash") or nil
end

local function addCash(player, amount)
	local cash = cashValue(player)
	if cash then
		cash.Value += amount
	end
end

local function grantHotDog(player, info, quiet)
	local plot = Plots.Get(player)
	if not plot then
		return false
	end

	local slot = Plots.FreeSlot(plot)
	if not slot then
		if not quiet then
			notify(player, "Your base is full! Steal-proof, but no room.", "warn")
		end
		return false
	end

	local model = HotDogs.Create(info)
	HotDogs.Place(model, plot, slot)

	if not quiet then
		notify(player, "Bought a " .. info.Name .. "!", "good")
	end
	return true
end

----------------------------------------------------------------------
-- Saving
----------------------------------------------------------------------

local function keyFor(player)
	return "player_" .. player.UserId
end

local function loadProfile(player)
	if not store then
		return nil
	end

	local ok, data = pcall(function()
		return store:GetAsync(keyFor(player))
	end)

	if ok and type(data) == "table" then
		return data
	end
	return nil
end

local function saveProfile(player)
	if not store then
		return
	end

	local cash = cashValue(player)
	local plot = Plots.Get(player)
	if not cash or not plot then
		return
	end

	local dogs = {}
	for _, model in pairs(plot.Slots) do
		table.insert(dogs, model:GetAttribute("HotDogId"))
	end

	local payload = { Cash = cash.Value, Dogs = dogs }
	local ok, err = pcall(function()
		store:SetAsync(keyFor(player), payload)
	end)

	if not ok then
		warn("[Steal a Hot Dog] Failed to save " .. player.Name .. ": " .. tostring(err))
	end
end

----------------------------------------------------------------------
-- Players
----------------------------------------------------------------------

local function onCharacterAdded(player, character)
	local plot = Plots.Get(player)
	if plot then
		local root = character:WaitForChild("HumanoidRootPart", 10)
		if root then
			task.wait(0.1)
			character:PivotTo(Plots.SpawnCFrame(plot))
		end
	end

	local humanoid = character:WaitForChild("Humanoid", 10)
	if humanoid then
		humanoid.Died:Connect(function()
			HotDogs.DropCarried(player)
		end)
	end
end

local function onPlayerAdded(player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"

	local cash = Instance.new("IntValue")
	cash.Name = "Cash"
	cash.Value = STARTING_CASH
	cash.Parent = stats

	stats.Parent = player
	player:SetAttribute("Income", 0)
	player:SetAttribute("Carrying", "")

	local plot = Plots.Assign(player)
	if not plot then
		notify(player, "All bases are taken - you are spectating this round.", "warn")
	end

	local profile = loadProfile(player)
	if profile then
		cash.Value = tonumber(profile.Cash) or STARTING_CASH
		if plot and type(profile.Dogs) == "table" then
			for _, id in ipairs(profile.Dogs) do
				local info = HotDogData.ById[id]
				if info then
					grantHotDog(player, info, true)
				end
			end
		end
	end

	player.CharacterAdded:Connect(function(character)
		onCharacterAdded(player, character)
	end)

	if player.Character then
		onCharacterAdded(player, player.Character)
	end

	task.defer(function()
		notify(player, "Welcome! Open the shop and buy your first hot dog.", "good")
	end)
end

local function onPlayerRemoving(player)
	saveProfile(player)

	local carried = HotDogs.Carrying[player]
	if carried then
		HotDogs.Carrying[player] = nil
		carried:Destroy()
	end

	lastBuy[player] = nil
	Plots.Release(player)
end

----------------------------------------------------------------------
-- Buying
----------------------------------------------------------------------

BuyHotDog.OnServerEvent:Connect(function(player, id)
	if type(id) ~= "string" then
		return
	end

	local info = HotDogData.ById[id]
	if not info then
		return
	end

	local now = os.clock()
	if lastBuy[player] and now - lastBuy[player] < BUY_COOLDOWN then
		return
	end
	lastBuy[player] = now

	local cash = cashValue(player)
	if not cash then
		return
	end

	if cash.Value < info.Price then
		notify(player, "You need $" .. HotDogData.Comma(info.Price - cash.Value) .. " more.", "warn")
		return
	end

	local plot = Plots.Get(player)
	if not plot or Plots.FreeSlot(plot) == nil then
		notify(player, "No free pedestal on your base.", "warn")
		return
	end

	cash.Value -= info.Price
	grantHotDog(player, info)
end)

MarketplaceService.ProcessReceipt = function(receiptInfo)
	local player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
	if not player then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local info = HotDogData.ByProduct[receiptInfo.ProductId]
	if not info then
		warn("[Steal a Hot Dog] Unknown developer product: " .. tostring(receiptInfo.ProductId))
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	if not grantHotDog(player, info) then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	saveProfile(player)
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

----------------------------------------------------------------------
-- Boot
----------------------------------------------------------------------

Plots.Init()
HotDogs.BindPlots()

for _, plot in ipairs(Plots.All) do
	plot.LockPrompt.Triggered:Connect(function(player)
		if plot.Owner ~= player then
			notify(player, "Only the owner can raise this shield.", "warn")
			return
		end

		local ok, message = Plots.Lock(plot)
		notify(player, message, ok and "good" or "warn")
	end)
end

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)

for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
end

-- Income tick
task.spawn(function()
	while true do
		task.wait(1)
		for _, plot in ipairs(Plots.All) do
			local owner = plot.Owner
			if owner then
				local income = Plots.Income(plot)
				owner:SetAttribute("Income", income)
				if income > 0 then
					addCash(owner, income)
				end
				Plots.Refresh(plot)
			end
		end
	end
end)

-- Periodic autosave
task.spawn(function()
	while true do
		task.wait(120)
		for _, player in ipairs(Players:GetPlayers()) do
			saveProfile(player)
		end
	end
end)

game:BindToClose(function()
	if RunService:IsStudio() then
		return
	end
	for _, player in ipairs(Players:GetPlayers()) do
		saveProfile(player)
	end
	task.wait(2)
end)
