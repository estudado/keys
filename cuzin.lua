-- Serviços
local Players = game:GetService('Players')
local UserInputService = game:GetService('UserInputService')
local LocalPlayer = Players.LocalPlayer

-- Estado da função
local isEnabled = false

-- Função que remove a skin (roupas, acessórios, gráficos) de um personagem
local function stripSkin(character)
    if not character then
        return
    end

    -- Aguarda o Humanoid se necessário
    local humanoid = character:FindFirstChildOfClass('Humanoid')
        or character:WaitForChild('Humanoid', 5)
    if not humanoid then
        return
    end

    task.wait(0.1) -- Pequeno delay para garantir que a aparência tenha carregado

    for _, item in ipairs(character:GetChildren()) do
        if
            item:IsA('Accessory')
            or item:IsA('Shirt')
            or item:IsA('Pants')
            or item:IsA('ShirtGraphic')
            or item:IsA('BodyColors')
            or item:IsA('CharacterMesh')
        then
            item:Destroy()
        end
    end
end

-- Aplica a remoção em todos os jogadores atuais
local function stripAllPlayers()
    for _, player in ipairs(Players:GetPlayers()) do
        if player.Character then
            stripSkin(player.Character)
        end
    end
end

-- Conecta o evento para cada novo personagem que nascer
local function onCharacterAdded(character)
    if isEnabled then
        stripSkin(character)
    end
end

-- Conecta evento quando um novo jogador entra no jogo
Players.PlayerAdded:Connect(function(player)
    player.CharacterAdded:Connect(onCharacterAdded)
end)

-- Conecta o evento para jogadores que já estão no servidor
for _, player in ipairs(Players:GetPlayers()) do
    player.CharacterAdded:Connect(onCharacterAdded)
end

-- Escuta a tecla F para ativar/desativar a função
UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then
        return
    end
    if input.KeyCode == Enum.KeyCode.F then
        isEnabled = not isEnabled

        if isEnabled then
            print('✅ Remoção de skins ATIVADA.')
            stripAllPlayers()
        else
            print('❌ Remoção de skins DESATIVADA.')
        end
    end
end)

print(
    "🔧 Script carregado. Pressione 'F' para ativar/desativar a remoção de skins."
)
