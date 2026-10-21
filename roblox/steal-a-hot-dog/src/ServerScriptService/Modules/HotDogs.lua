--[[
	HotDogs
	Builds hot dog models and runs the steal / carry / drop-off loop.
--]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local HotDogData = require(ReplicatedStorage:WaitForChild("HotDogData"))
local Plots = require(script.Parent:WaitForChild("Plots"))

local HotDogs = {}

local carrying = {}
HotDogs.Carrying = carrying

-- Replaced by Main so this module can talk to the player's screen.
HotDogs.Notify = function(_player, _message, _kind) end

local function promptOf(model)
	local primary = model.PrimaryPart
	return primary and primary:FindFirstChildOfClass("ProximityPrompt") or nil
end

local function weldTo(anchor, part)
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = anchor
	weld.Part1 = part
	weld.Parent = anchor
end

function HotDogs.Create(info)
	local model = Instance.new("Model")
	model.Name = info.Name
	model:SetAttribute("HotDogId", info.Id)
	model:SetAttribute("State", "Idle")
	model:SetAttribute("CarriedBy", 0)

	local bun = Instance.new("Part")
	bun.Name = "Bun"
	bun.Size = Vector3.new(5.2, 1.3, 2)
	bun.Color = info.BunColor
	bun.Material = info.BunMaterial
	bun.Anchored = true
	bun.CanCollide = false
	bun.Massless = true
	bun.TopSurface = Enum.SurfaceType.Smooth
	bun.BottomSurface = Enum.SurfaceType.Smooth
	bun.Parent = model

	model.PrimaryPart = bun

	local sausage = Instance.new("Part")
	sausage.Name = "Sausage"
	sausage.Shape = Enum.PartType.Cylinder
	sausage.Size = Vector3.new(5.6, 1.3, 1.3)
	sausage.Color = info.SausageColor
	sausage.Material = info.SausageMaterial
	sausage.Anchored = false
	sausage.CanCollide = false
	sausage.Massless = true
	sausage.CFrame = bun.CFrame * CFrame.new(0, 0.8, 0)
	sausage.Parent = model
	weldTo(bun, sausage)

	for _, side in ipairs({ -1, 1 }) do
		local cap = Instance.new("Part")
		cap.Name = "Cap"
		cap.Shape = Enum.PartType.Ball
		cap.Size = Vector3.new(1.3, 1.3, 1.3)
		cap.Color = info.SausageColor
		cap.Material = info.SausageMaterial
		cap.Anchored = false
		cap.CanCollide = false
		cap.Massless = true
		cap.CFrame = bun.CFrame * CFrame.new(side * 2.8, 0.8, 0)
		cap.Parent = model
		weldTo(bun, cap)
	end

	local billboard = Instance.new("BillboardGui")
	billboard.Name = "Tag"
	billboard.Size = UDim2.fromOffset(220, 58)
	billboard.StudsOffset = Vector3.new(0, 3, 0)
	billboard.MaxDistance = 90
	billboard.LightInfluence = 0
	billboard.Parent = bun

	local title = Instance.new("TextLabel")
	title.BackgroundTransparency = 1
	title.Size = UDim2.fromScale(1, 0.58)
	title.Font = Enum.Font.GothamBold
	title.Text = info.Name
	title.TextScaled = true
	title.TextColor3 = HotDogData.RarityColor[info.Rarity] or Color3.fromRGB(255, 255, 255)
	title.TextStrokeTransparency = 0.4
	title.Parent = billboard

	local rate = Instance.new("TextLabel")
	rate.BackgroundTransparency = 1
	rate.Position = UDim2.fromScale(0, 0.58)
	rate.Size = UDim2.fromScale(1, 0.42)
	rate.Font = Enum.Font.GothamMedium
	rate.Text = "$" .. HotDogData.Abbreviate(info.Income) .. " / sec"
	rate.TextScaled = true
	rate.TextColor3 = Color3.fromRGB(130, 235, 150)
	rate.TextStrokeTransparency = 0.5
	rate.Parent = billboard

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "Interact"
	prompt.ActionText = "Steal"
	prompt.ObjectText = info.Name
	prompt.HoldDuration = info.StealSeconds
	prompt.MaxActivationDistance = 11
	prompt.RequiresLineOfSight = false
	prompt.Parent = bun

	prompt.Triggered:Connect(function(player)
		HotDogs.OnPrompt(player, model)
	end)

	return model
end

function HotDogs.Place(model, plot, slot)
	local info = HotDogData.ById[model:GetAttribute("HotDogId")]
	if not info then
		return false
	end

	local pedestal = plot.Pedestals[slot]
	if not pedestal then
		return false
	end

	local bun = model.PrimaryPart
	local weld = bun:FindFirstChild("CarryWeld")
	if weld then
		weld:Destroy()
	end

	bun.Anchored = true
	model.Parent = plot.Model
	model:PivotTo(pedestal.CFrame * CFrame.new(0, 3.4, 0))

	plot.Slots[slot] = model
	model:SetAttribute("State", "Placed")
	model:SetAttribute("PlotIndex", plot.Index)
	model:SetAttribute("Slot", slot)
	model:SetAttribute("CarriedBy", 0)

	local prompt = promptOf(model)
	if prompt then
		prompt.ActionText = "Steal"
		prompt.HoldDuration = info.StealSeconds
		prompt.Enabled = true
	end

	Plots.Refresh(plot)
	Plots.OnChanged(plot)
	return true
end

local function unplace(model)
	local plot = Plots.ByIndex(model:GetAttribute("PlotIndex"))
	local slot = model:GetAttribute("Slot")
	if plot and slot and plot.Slots[slot] == model then
		plot.Slots[slot] = nil
		Plots.Refresh(plot)
		Plots.OnChanged(plot)
	end
	model:SetAttribute("PlotIndex", 0)
	model:SetAttribute("Slot", 0)
	return plot
end

HotDogs.Unplace = unplace

local function carry(player, model)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		return false
	end

	local bun = model.PrimaryPart
	bun.Anchored = false
	model.Parent = workspace
	model:PivotTo(root.CFrame * CFrame.new(0, 2.4, -2.6))

	local weld = Instance.new("Weld")
	weld.Name = "CarryWeld"
	weld.Part0 = root
	weld.Part1 = bun
	weld.C0 = CFrame.new(0, 2.4, -2.6)
	weld.Parent = bun

	carrying[player] = model
	model:SetAttribute("State", "Carried")
	model:SetAttribute("CarriedBy", player.UserId)
	player:SetAttribute("Carrying", model.Name)

	local prompt = promptOf(model)
	if prompt then
		prompt.Enabled = false
	end

	return true
end

function HotDogs.Drop(model, position)
	local holderId = model:GetAttribute("CarriedBy")
	if holderId and holderId ~= 0 then
		local holder = Players:GetPlayerByUserId(holderId)
		if holder then
			carrying[holder] = nil
			holder:SetAttribute("Carrying", "")
		end
	end

	local bun = model.PrimaryPart
	local weld = bun:FindFirstChild("CarryWeld")
	if weld then
		weld:Destroy()
	end

	bun.Anchored = true
	model.Parent = workspace
	model:PivotTo(CFrame.new(position.X, 4, position.Z))

	model:SetAttribute("State", "Dropped")
	model:SetAttribute("CarriedBy", 0)

	local prompt = promptOf(model)
	if prompt then
		prompt.ActionText = "Grab"
		prompt.HoldDuration = 1
		prompt.Enabled = true
	end
end

function HotDogs.DropCarried(player)
	local model = carrying[player]
	if not model then
		return
	end

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local position = root and root.Position or Vector3.new(0, 6, 0)
	HotDogs.Drop(model, position)
end

function HotDogs.OnPrompt(player, model)
	if model:GetAttribute("State") == "Carried" then
		return
	end

	if carrying[player] then
		HotDogs.Notify(player, "You can only carry one hot dog at a time!", "warn")
		return
	end

	local home = Plots.Get(player)
	if not home then
		HotDogs.Notify(player, "You do not have a base yet.", "warn")
		return
	end

	if Plots.FreeSlot(home) == nil then
		HotDogs.Notify(player, "Your base is full - no room to put it down.", "warn")
		return
	end

	if model:GetAttribute("State") == "Placed" then
		local target = Plots.ByIndex(model:GetAttribute("PlotIndex"))
		if target and target.Owner == player then
			HotDogs.Notify(player, "That one is already yours.", "warn")
			return
		end
		if target and target.Locked then
			HotDogs.Notify(player, "That base is shielded right now!", "warn")
			return
		end

		unplace(model)
		if carry(player, model) then
			HotDogs.Notify(player, "Stole a " .. model.Name .. "! Run it to your drop off pad.", "good")
			if target and target.Owner then
				HotDogs.Notify(target.Owner, player.DisplayName .. " stole your " .. model.Name .. "!", "bad")
			end
		end
	elseif model:GetAttribute("State") == "Dropped" then
		if carry(player, model) then
			HotDogs.Notify(player, "Picked up a " .. model.Name .. "!", "good")
		end
	end
end

function HotDogs.BindPlots()
	for _, plot in ipairs(Plots.All) do
		plot.DepositPad.Touched:Connect(function(hit)
			local player = Players:GetPlayerFromCharacter(hit.Parent)
			if not player or plot.Owner ~= player then
				return
			end

			local model = carrying[player]
			if not model then
				return
			end

			local slot = Plots.FreeSlot(plot)
			if not slot then
				HotDogs.Notify(player, "Your base is full!", "warn")
				return
			end

			carrying[player] = nil
			player:SetAttribute("Carrying", "")
			HotDogs.Place(model, plot, slot)
			HotDogs.Notify(player, model.Name .. " secured! It now pays you.", "good")
		end)
	end
end

return HotDogs
