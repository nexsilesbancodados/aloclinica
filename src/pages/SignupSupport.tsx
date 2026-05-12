/**
 * SignupSupport - Formulário de cadastro para equipe de suporte
 * Campos: Nome, Email, Telefone, CPF, Senha
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { CPFInput, PhoneInput } from "@/components/ui/masked-inputs";
import {
  validarNome,
  validarEmail,
  validarTelefone,
  validarCPF,
  validarSenha,
} from "@/lib/form-validators";
import { ArrowLeft, Eye, EyeSlash } from "@phosphor-icons/react";
import { toastError } from "@/lib/errorMessages";

interface FormData {
  full_name: string;
  email: string;
  phone: string;
  cpf: string;
  password: string;
  password_confirm: string;
}

interface FormErrors {
  [key: string]: string;
}

export default function SignupSupport() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    full_name: "",
    email: "",
    phone: "",
    cpf: "",
    password: "",
    password_confirm: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!validarNome(formData.full_name)) {
      newErrors.full_name = "Nome deve ter pelo menos 2 nomes completos";
    }

    if (!validarEmail(formData.email)) {
      newErrors.email = "Email inválido";
    }

    if (!validarTelefone(formData.phone)) {
      newErrors.phone = "Telefone inválido (formato: (11) 9XXXX-XXXX)";
    }

    if (!validarCPF(formData.cpf)) {
      newErrors.cpf = "CPF inválido";
    }

    const passwordValidation = validarSenha(formData.password);
    if (!passwordValidation.isValid) {
      newErrors.password = passwordValidation.feedback.join(", ");
    }

    if (formData.password !== formData.password_confirm) {
      newErrors.password_confirm = "Senhas não conferem";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Preencha todos os campos corretamente");
      return;
    }

    setLoading(true);
    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await db.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Falha ao criar usuário");

      // 2. Create support profile
      const { error: profileError } = await (db as any).from("profiles").insert([
        {
          id: authData.user.id,
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
          cpf: formData.cpf.replace(/\D/g, ""),
          role: "support",
          avatar_url: null,
          created_at: new Date().toISOString(),
        },
      ]);

      if (profileError) throw profileError;

      toast.success("Cadastro realizado com sucesso! Verifique seu email.");
      navigate("/suporte");
    } catch (error) {
      toastError(toast, error, "signup");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-md mx-auto">
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Voltar</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900">Cadastro de Suporte</h1>
          <p className="text-gray-600 mt-2">Preencha seus dados para criar sua conta de suporte</p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          onSubmit={handleSubmit}
          className="space-y-4 bg-white p-6 rounded-lg shadow-sm border border-gray-200"
        >
          {/* Nome Completo */}
          <div className="space-y-2">
            <Label htmlFor="full_name">
              Nome Completo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              placeholder="João Silva Santos"
              value={formData.full_name}
              onChange={handleChange}
              className={errors.full_name ? "border-red-500" : ""}
            />
            {errors.full_name && (
              <p className="text-sm text-red-500">{errors.full_name}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              value={formData.email}
              onChange={handleChange}
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email}</p>
            )}
          </div>

          {/* Telefone */}
          <PhoneInput
            value={formData.phone}
            onChange={(phone) =>
              setFormData((prev) => ({ ...prev, phone }))
            }
            required
            error={errors.phone}
          />

          {/* CPF */}
          <CPFInput
            value={formData.cpf}
            onChange={(cpf) =>
              setFormData((prev) => ({ ...prev, cpf }))
            }
            required
            error={errors.cpf}
          />

          {/* Senha */}
          <div className="space-y-2">
            <Label htmlFor="password">
              Senha <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Mínimo 8 caracteres"
                value={formData.password}
                onChange={handleChange}
                className={errors.password ? "border-red-500 pr-10" : "pr-10"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? (
                  <EyeSlash className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password}</p>
            )}
          </div>

          {/* Confirmar Senha */}
          <div className="space-y-2">
            <Label htmlFor="password_confirm">
              Confirmar Senha <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="password_confirm"
                name="password_confirm"
                type={showPasswordConfirm ? "text" : "password"}
                placeholder="Confirme sua senha"
                value={formData.password_confirm}
                onChange={handleChange}
                className={errors.password_confirm ? "border-red-500 pr-10" : "pr-10"}
              />
              <button
                type="button"
                onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPasswordConfirm ? (
                  <EyeSlash className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password_confirm && (
              <p className="text-sm text-red-500">{errors.password_confirm}</p>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? "Cadastrando..." : "Criar Conta"}
          </Button>

          {/* Login Link */}
          <p className="text-center text-sm text-gray-600">
            Já tem conta?{" "}
            <button
              type="button"
              onClick={() => navigate("/suporte")}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Fazer login
            </button>
          </p>
        </motion.form>
      </div>
    </div>
  );
}
