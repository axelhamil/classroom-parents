import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyH2, TypographyList, TypographyP } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { ContactLink } from "../components/contact-link";

const GOOGLE_USER_DATA_POLICY = "https://developers.google.com/terms/api-services-user-data-policy";

export function PrivacyPolicyBody(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <TypographyH2>Qui traite vos données</TypographyH2>
        <TypographyP>
          L'éditeur de l'application est responsable du traitement. Pour toute question sur vos
          données ou pour exercer vos droits, écrivez à <ContactLink />.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Ce que fait l'application</TypographyH2>
        <TypographyP>
          Vous liez le compte Google Classroom de chacun de vos enfants. L'application lit, en
          lecture seule, ses cours, les annonces de ses enseignants et ses devoirs, en tire les
          échéances (évaluations, devoirs, sorties, piscine, documents à rendre) et vous prévient
          avant chacune d'elles.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Données traitées</TypographyH2>
        <TypographyList>
          <li>Votre compte : nom, adresse e-mail, photo et identifiant de votre compte Google.</li>
          <li>
            Le compte de chaque enfant lié : nom, adresse e-mail, photo et identifiant Google, et
            les jetons d'accès que Google nous remet, chiffrés en base.
          </li>
          <li>
            Google Classroom : la liste de ses cours ; le texte des annonces, lu le temps d'en
            extraire les dates puis jamais conservé (nous gardons seulement l'identifiant et le lien
            de l'annonce) ; le titre, la date limite et l'état rendu ou non de ses devoirs.
          </li>
          <li>
            Les échéances obtenues : titre, courte description (300 caractères à l'extraction),
            catégorie et date, avec les corrections que vous y apportez.
          </li>
          <li>
            Vos alertes : l'heure choisie pour chaque échéance, l'adresse technique d'abonnement aux
            notifications de chacun de vos appareils et le type de navigateur.
          </li>
          <li>
            Votre lien d'agenda, si vous en créez un : une empreinte de son secret (jamais le lien
            lui-même), les enfants qu'il inclut et l'heure de sa dernière lecture. L'agenda que vous
            y abonnez (Google, Apple, Outlook) lit vos échéances par ce lien et en garde une copie
            selon ses propres règles.
          </li>
          <li>
            Les sessions de connexion (adresse IP, navigateur) et les e-mails que nous vous
            envoyons.
          </li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Données de mineurs</TypographyH2>
        <TypographyP>
          Les données Classroom sont celles d'enfants mineurs. Seul un parent ou un représentant
          légal crée un compte et lie le compte de son enfant, depuis sa propre session ; l'enfant
          n'utilise pas l'application. Pour un enfant de moins de 15 ans, cette liaison relève du
          titulaire de l'autorité parentale. Nous ne faisons ni profilage, ni publicité, ni revente,
          et nous ne collectons que ce qui sert à afficher les échéances.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Finalités et bases légales</TypographyH2>
        <TypographyList>
          <li>
            Afficher les échéances de vos enfants et vous alerter : exécution du service que vous
            demandez (article 6.1.b du RGPD).
          </li>
          <li>
            Sécuriser le service et prévenir les abus : intérêt légitime (article 6.1.f du RGPD).
          </li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Données reçues des API Google</TypographyH2>
        <TypographyP>
          L'utilisation et le transfert à toute autre application des informations reçues des API
          Google respectent la{" "}
          <TextLink href={GOOGLE_USER_DATA_POLICY} target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </TextLink>
          , y compris ses exigences d'usage limité (Limited Use requirements).
        </TypographyP>
        <TypographyList>
          <li>
            Accès demandés : connexion (openid, email, profile) et lecture seule de Classroom
            (cours, annonces, devoirs de l'élève). Aucune écriture dans Classroom.
          </li>
          <li>Ces données servent uniquement à afficher les échéances et à envoyer vos alertes.</li>
          <li>
            Elles ne sont ni vendues, ni utilisées pour de la publicité, ni pour évaluer une
            solvabilité, ni pour entraîner des modèles d'intelligence artificielle.
          </li>
          <li>
            Personne ne les lit, sauf avec votre accord explicite, pour la sécurité, ou si la loi
            l'impose.
          </li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Extraction par Anthropic</TypographyH2>
        <TypographyP>
          Pour trouver les dates dans une annonce, son texte et sa date de publication sont envoyés
          à Anthropic, PBC (modèles Claude), qui agit comme sous-traitant. Anthropic n'utilise pas
          les données reçues par son API pour entraîner ses modèles et ne les garde que le temps
          prévu par ses conditions commerciales. Les devoirs Classroom sont lus sans intelligence
          artificielle.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Sous-traitants et transferts</TypographyH2>
        <TypographyP>
          Google, Anthropic, Resend et Railway traitent des données pour notre compte. Certains sont
          établis aux États-Unis : les transferts reposent sur le cadre EU-US Data Privacy Framework
          ou sur les clauses contractuelles types de la Commission européenne. La liste à jour est
          dans le{" "}
          <TextLink asChild>
            <Link to="/legal/sub-processors">registre des sous-traitants</Link>
          </TextLink>
          .
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Durées de conservation</TypographyH2>
        <TypographyList>
          <li>Texte des annonces : aucune conservation après l'extraction.</li>
          <li>
            Compte, enfants liés et échéances, passées comprises : tant que votre compte existe.
          </li>
          <li>Enfant retiré : ses accès Google sont révoqués et ses données effacées aussitôt.</li>
          <li>
            Compte supprimé : effacement complet 7 jours après la demande, délai pendant lequel vous
            pouvez annuler.
          </li>
          <li>E-mails envoyés : 7 jours au plus.</li>
          <li>
            Abonnement aux notifications d'un appareil : jusqu'à sa désactivation, votre déconnexion
            de cet appareil ou son expiration.
          </li>
          <li>
            Lien d'agenda : jusqu'à sa révocation, son remplacement ou la suppression de votre
            compte ; il cesse alors aussitôt de fonctionner.
          </li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Révoquer l'accès</TypographyH2>
        <TypographyP>
          Retirez un enfant depuis l'écran Enfants : nous révoquons son accès auprès de Google et
          effaçons ses données. Vous pouvez aussi retirer l'application depuis{" "}
          <TextLink
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noopener noreferrer"
          >
            les connexions de votre compte Google
          </TextLink>
          ; l'application vous demandera alors de reconnecter l'enfant.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Vos droits</TypographyH2>
        <TypographyP>
          Vous disposez des droits d'accès, de rectification, d'effacement, de limitation,
          d'opposition et de portabilité. La suppression du compte se fait dans Réglages ; pour les
          autres droits, écrivez à <ContactLink />. Vous pouvez aussi saisir la CNIL (cnil.fr). Le
          détail est sur la page{" "}
          <TextLink asChild>
            <Link to="/legal/data-rights">vos droits sur vos données</Link>
          </TextLink>
          .
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Sécurité et cookies</TypographyH2>
        <TypographyP>
          Les échanges sont chiffrés (HTTPS) et les jetons Google sont chiffrés en base
          (XChaCha20-Poly1305). L'application ne dépose que les cookies nécessaires à la connexion,
          détaillés sur la page{" "}
          <TextLink asChild>
            <Link to="/legal/cookies">cookies</Link>
          </TextLink>
          .
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Modifications</TypographyH2>
        <TypographyP>
          Nous vous prévenons par e-mail avant tout changement important de cette politique.
        </TypographyP>
      </section>
    </div>
  );
}

export function TermsBody(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <TypographyH2>Le service</TypographyH2>
        <TypographyP>
          L'application rassemble les échéances scolaires de vos enfants à partir de leur compte
          Google Classroom et vous alerte avant chacune d'elles. Elle est gratuite et ne lit
          Classroom qu'en lecture seule.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Votre compte</TypographyH2>
        <TypographyP>
          Vous vous connectez avec votre compte Google. Vous ne liez que les comptes d'enfants dont
          vous êtes parent ou représentant légal.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Fiabilité des échéances</TypographyH2>
        <TypographyP>
          Les dates des annonces sont extraites automatiquement et peuvent être fausses : une
          échéance douteuse est marquée « à vérifier ». Classroom et les enseignants restent la
          référence. Une alerte peut aussi arriver en retard ou pas du tout (téléphone éteint,
          notifications bloquées, panne d'un prestataire) : l'application vous aide, elle ne
          remplace pas votre vigilance.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Disponibilité et responsabilité</TypographyH2>
        <TypographyP>
          Nous faisons notre possible pour que le service fonctionne, sans garantie de
          disponibilité. Notre responsabilité ne peut être engagée pour une échéance manquée.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Fin d'utilisation</TypographyH2>
        <TypographyP>
          Vous pouvez retirer un enfant ou supprimer votre compte à tout moment depuis
          l'application. Nous pouvons suspendre un compte utilisé de façon abusive.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Droit applicable et contact</TypographyH2>
        <TypographyP>
          Ces conditions relèvent du droit français. Pour toute question : <ContactLink />.
        </TypographyP>
      </section>
    </div>
  );
}
